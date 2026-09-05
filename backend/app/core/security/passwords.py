"""
Password hashing (Argon2id) and password policy enforcement.
"""
from __future__ import annotations

import re

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app.core.settings.config import get_settings

settings = get_settings()

# Argon2id parameters tuned for a small internal app on modest VPS hardware.
# time_cost/memory_cost can be raised as server resources allow.
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=2,
    hash_len=32,
    salt_len=16,
)


def hash_password(plain_password: str) -> str:
    return _hasher.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """Call after a successful verify; rehash if Argon2 params have changed."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


class PasswordPolicyError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def validate_password_policy(password: str) -> None:
    """Raises PasswordPolicyError with all violated rules if invalid."""
    errors: list[str] = []

    if len(password) < settings.PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long.")
    if settings.PASSWORD_REQUIRE_UPPERCASE and not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter.")
    if settings.PASSWORD_REQUIRE_LOWERCASE and not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter.")
    if settings.PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", password):
        errors.append("Password must contain at least one digit.")
    if settings.PASSWORD_REQUIRE_SPECIAL and not re.search(r"[^\w\s]", password):
        errors.append("Password must contain at least one special character.")

    if errors:
        raise PasswordPolicyError(errors)
