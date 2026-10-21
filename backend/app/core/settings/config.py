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
    # Rate limits per kind of request: "<count>/<window seconds>"
    # (see app/middleware/rate_limit.py for what each kind covers).
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_LOGIN: str = "10/60"
    RATE_LIMIT_LOGIN_ACCOUNT: str = "20/3600"
    RATE_LIMIT_AUTH: str = "20/60"
    RATE_LIMIT_RESET_ACCOUNT: str = "5/3600"
    RATE_LIMIT_UPLOAD: str = "20/60"
    RATE_LIMIT_HEAVY: str = "60/60"
    RATE_LIMIT_API: str = "300/60"
    RATE_LIMIT_API_IP: str = "600/60"

    # ---- Redis (cache + shared rate-limit counters). Empty = disabled. ----
    REDIS_URL: str = ""
    CACHE_DEFAULT_TTL: int = 60

    # ---- DB connection pool (per worker process) ----
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE_SECONDS: int = 1800
    DB_STATEMENT_TIMEOUT_MS: int = 30000

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

    # ---- WhatsApp bridge (whatsapp-service) ----
    WHATSAPP_SERVICE_URL: str = "http://whatsapp-service:3001"

    # ---- Snapchat lead forms -> CRM (webhook) ----
    # Secret path segment of the webhook URL given to Snap:
    #   https://<domain>/api/integrations/snap/webhook/<SNAP_WEBHOOK_TOKEN>
    # Empty = webhook disabled (404). Generate: openssl rand -hex 24
    SNAP_WEBHOOK_TOKEN: str = ""
    # hmacSecret returned by Snap when the webhook integration is created
    # (optional - when set, a request with a wrong signature is rejected).
    SNAP_WEBHOOK_HMAC_SECRET: str = ""
    # Who leads created by the webhook are "created by" (default: oldest
    # active user) and who they are assigned to (default: unassigned).
    SNAP_LEADS_SYSTEM_USER_EMAIL: str = ""
    SNAP_LEADS_DEFAULT_ASSIGNEE_EMAIL: str = ""

    # ---- CRM progress -> Snap Conversions API (offline events) ----
    SNAP_CAPI_ENABLED: bool = False
    SNAP_PIXEL_ID: str = ""
    SNAP_CAPI_TOKEN: str = ""
    # Snap event name per CRM stage (empty = don't report that stage)
    SNAP_EVENT_BOOKED: str = "RESERVE"
    SNAP_EVENT_ATTENDED: str = "START_TRIAL"
    SNAP_EVENT_PURCHASE: str = "PURCHASE"
    # also send Snap's own lead_id with each event (exact ad match for form leads)
    SNAP_CAPI_SEND_LEAD_ID: bool = True

    @field_validator("SNAP_CAPI_ENABLED", "SNAP_CAPI_SEND_LEAD_ID", mode="before")
    @classmethod
    def blank_bool(cls, v: object, info) -> object:
        if isinstance(v, str) and v.strip() == "":
            return info.field_name == "SNAP_CAPI_SEND_LEAD_ID"
        return v

    # ---- CRM progress -> Meta Conversions API (CRM lead events) ----
    META_CAPI_ENABLED: bool = False
    META_PIXEL_ID: str = ""          # dataset / pixel id (Events Manager)
    META_CAPI_TOKEN: str = ""
    META_API_VERSION: str = "v21.0"
    META_TEST_EVENT_CODE: str = ""   # Events Manager -> Test events (test-event endpoint only)
    META_EVENT_BOOKED: str = "Schedule"
    META_EVENT_ATTENDED: str = "StartTrial"
    META_EVENT_PURCHASE: str = "Purchase"

    # ---- CRM progress -> TikTok Events API ----
    TIKTOK_EVENTS_ENABLED: bool = False
    TIKTOK_EVENT_SOURCE: str = "web"     # web (pixel code) | crm | offline (event set id)
    TIKTOK_EVENT_SOURCE_ID: str = ""
    TIKTOK_ACCESS_TOKEN: str = ""
    TIKTOK_PAGE_URL: str = "https://aischool.sa/"
    TIKTOK_TEST_EVENT_CODE: str = ""
    TIKTOK_EVENT_BOOKED: str = "Schedule"
    TIKTOK_EVENT_ATTENDED: str = "StartTrial"
    TIKTOK_EVENT_PURCHASE: str = "CompletePayment"

    # name shown to the platforms as the CRM the lead events come from
    ADS_LEAD_EVENT_SOURCE: str = "AI School Dashboard"

    @field_validator("META_CAPI_ENABLED", "TIKTOK_EVENTS_ENABLED", mode="before")
    @classmethod
    def blank_false(cls, v: object) -> object:
        if isinstance(v, str) and v.strip() == "":
            return False
        return v

    def snap_capi_ready(self) -> bool:
        return bool(self.SNAP_CAPI_ENABLED and self.SNAP_PIXEL_ID and self.SNAP_CAPI_TOKEN)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
