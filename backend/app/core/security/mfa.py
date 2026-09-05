"""
TOTP-based MFA: secret generation/encryption, code verification,
QR provisioning URI, and recovery codes.

The TOTP secret is encrypted at rest using Fernet (symmetric encryption)
keyed off JWT_SECRET_KEY-derived material, so a raw DB dump alone does not
reveal usable MFA secrets. This is defense-in-depth, not a replacement for
DB access controls.
"""
from __future__ import annotations

import base64
import hashlib
import secrets

import pyotp
from cryptography.fernet import Fernet, InvalidToken

from app.core.security.passwords import hash_password, verify_password
from app.core.settings.config import get_settings

settings = get_settings()


def _fernet() -> Fernet:
    # Derive a valid 32-byte urlsafe-base64 Fernet key from the JWT secret.
    digest = hashlib.sha256(settings.JWT_SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Could not decrypt MFA secret") from exc


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=email, issuer_name=settings.MFA_ISSUER_NAME
    )


def verify_totp_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    # valid_window=1 tolerates minor clock drift (±30s)
    return totp.verify(code, valid_window=1)


def generate_recovery_codes(count: int = 10) -> list[str]:
    """Human-friendly one-time codes, e.g. 'XXXX-XXXX-XXXX'."""
    codes = []
    for _ in range(count):
        raw = secrets.token_hex(6).upper()
        codes.append(f"{raw[0:4]}-{raw[4:8]}-{raw[8:12]}")
    return codes


def hash_recovery_code(code: str) -> str:
    return hash_password(code)


def verify_recovery_code(code: str, code_hash: str) -> bool:
    return verify_password(code, code_hash)
