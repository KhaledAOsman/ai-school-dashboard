"""
Application configuration loaded from environment variables.

CRITICAL: Never hard-code secrets here. Everything sensitive comes from
environment variables (see .env.example at the repo root for the full list).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal
from urllib.parse import quote_plus

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- General ----
    APP_NAME: str = "AI School Management Platform"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api"

    # ---- Database ----
    # Preferred: set the individual POSTGRES_* fields below and let
    # DATABASE_URL be built automatically, with the password correctly
    # URL-encoded regardless of which special characters it contains (no
    # need to manually percent-encode "@", ":", "/", etc. yourself - a
    # common source of connection errors otherwise).
    # Alternative: set DATABASE_URL directly instead - if present, it is
    # used as-is and the POSTGRES_* fields below are ignored.
    DATABASE_URL: str = Field(
        default="",
        description="postgresql+asyncpg://user:password@host:port/dbname",
    )
    POSTGRES_USER: str = ""
    POSTGRES_PASSWORD: str = ""
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = ""

    @model_validator(mode="after")
    def build_database_url_if_missing(self) -> "Settings":
        if not self.DATABASE_URL:
            if not (self.POSTGRES_USER and self.POSTGRES_PASSWORD and self.POSTGRES_DB):
                raise ValueError(
                    "Set either DATABASE_URL, or all of POSTGRES_USER / "
                    "POSTGRES_PASSWORD / POSTGRES_DB, in your .env file."
                )
            encoded_user = quote_plus(self.POSTGRES_USER)
            encoded_password = quote_plus(self.POSTGRES_PASSWORD)
            self.DATABASE_URL = (
                f"postgresql+asyncpg://{encoded_user}:{encoded_password}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self

    # ---- Security / Auth ----
    JWT_SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MFA_ISSUER_NAME: str = "AI School Dashboard"

    # Password policy
    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True

    # Lockout / rate limiting
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15
    LOGIN_RATE_LIMIT: str = "10/minute"
    GLOBAL_RATE_LIMIT: str = "100/minute"

    # ---- CORS ----
    CORS_ORIGINS: str = "https://dashboard.rawadaltarh.com"

    @field_validator("CORS_ORIGINS")
    @classmethod
    def split_origins(cls, v: str) -> str:
        return v

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @field_validator("SMTP_PORT", "S3_ENDPOINT_URL", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY",
                     "S3_REGION", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_ADDRESS",
                     mode="before")
    @classmethod
    def blank_env_string_to_none(cls, v: object) -> object:
        # .env files can only represent "unset" as an empty string (e.g.
        # SMTP_PORT=), which pydantic would otherwise try to parse as the
        # field's real type (int, etc.) and fail. Treat a blank string as
        # "not provided" for every optional field above.
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    # ---- File storage ----
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    LOCAL_STORAGE_PATH: str = "/app/storage/attachments"
    MAX_UPLOAD_SIZE_MB: int = 15
    ALLOWED_ATTACHMENT_TYPES: str = "application/pdf,image/png,image/jpeg,image/webp"

    def allowed_attachment_types_list(self) -> list[str]:
        return [t.strip() for t in self.ALLOWED_ATTACHMENT_TYPES.split(",") if t.strip()]

    # S3-compatible (future)
    S3_ENDPOINT_URL: str | None = None
    S3_BUCKET: str | None = None
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    S3_REGION: str | None = None

    # ---- Notifications (future email/SMS providers) ----
    SMTP_HOST: str | None = None
    SMTP_PORT: int | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_ADDRESS: str | None = None

    # ---- Currency ----
    DEFAULT_CURRENCY: str = "SAR"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
