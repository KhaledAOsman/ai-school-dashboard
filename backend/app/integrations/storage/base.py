"""
Abstract file storage interface. Finance attachment business logic depends
only on this interface, never on a concrete backend - so switching from
local disk to S3-compatible object storage later means writing one new
class here and changing a config value, not touching finance code.
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, *, storage_key: str, content: bytes) -> None:
        """Persist file content under the given internal storage key."""
        raise NotImplementedError

    @abstractmethod
    async def read(self, *, storage_key: str) -> bytes:
        """Retrieve file content by storage key. Raises FileNotFoundError if missing."""
        raise NotImplementedError

    @abstractmethod
    async def delete(self, *, storage_key: str) -> None:
        """Remove the file at storage_key. Should be idempotent."""
        raise NotImplementedError

    @abstractmethod
    async def exists(self, *, storage_key: str) -> bool:
        raise NotImplementedError
