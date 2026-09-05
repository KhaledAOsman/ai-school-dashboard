"""
Local filesystem storage backend.

Security notes:
    - storage_key is ALWAYS a server-generated random token (see
      modules/finance/attachments/service.py), never derived from a
      user-supplied filename. This eliminates path-traversal risk at the
      source, but we still defensively re-validate the resolved path stays
      inside the storage root, in case a future caller passes something
      unexpected.
    - Files live outside any directory served by Nginx/static file serving.
      There is no static route that maps to LOCAL_STORAGE_PATH.
"""
from __future__ import annotations

import os
from pathlib import Path

import aiofiles

from app.integrations.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    def __init__(self, root_path: str):
        self.root = Path(root_path).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, storage_key: str) -> Path:
        # Reject any key containing path separators or traversal sequences.
        if "/" in storage_key or "\\" in storage_key or ".." in storage_key:
            raise ValueError("Invalid storage key")

        candidate = (self.root / storage_key).resolve()
        if self.root not in candidate.parents and candidate != self.root:
            raise ValueError("Resolved path escapes storage root")
        return candidate

    async def save(self, *, storage_key: str, content: bytes) -> None:
        path = self._resolve(storage_key)
        async with aiofiles.open(path, "wb") as f:
            await f.write(content)
        os.chmod(path, 0o600)  # owner read/write only

    async def read(self, *, storage_key: str) -> bytes:
        path = self._resolve(storage_key)
        if not path.exists():
            raise FileNotFoundError(storage_key)
        async with aiofiles.open(path, "rb") as f:
            return await f.read()

    async def delete(self, *, storage_key: str) -> None:
        path = self._resolve(storage_key)
        if path.exists():
            path.unlink()

    async def exists(self, *, storage_key: str) -> bool:
        return self._resolve(storage_key).exists()
