"""
Returns the configured storage backend. Everything else in the app should
depend on get_storage_backend(), never import LocalStorageBackend directly.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.settings.config import get_settings
from app.integrations.storage.base import StorageBackend
from app.integrations.storage.local import LocalStorageBackend

settings = get_settings()


@lru_cache
def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_BACKEND == "local":
        return LocalStorageBackend(settings.LOCAL_STORAGE_PATH)
    if settings.STORAGE_BACKEND == "s3":
        # Placeholder for future S3-compatible backend. Raises clearly rather
        # than silently falling back, so a misconfiguration is caught early.
        raise NotImplementedError(
            "S3 storage backend is not yet implemented. Set STORAGE_BACKEND=local, "
            "or implement integrations/storage/s3.py and wire it in here."
        )
    raise ValueError(f"Unknown STORAGE_BACKEND: {settings.STORAGE_BACKEND}")
