from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Read from environment variables, falling back to backend/.env for local development."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str
    # Project URL, e.g. https://<project-ref>.supabase.co. Used to fetch the JWT signing keys.
    supabase_url: str = ""
    # Public "anon" / publishable key. Safe in the browser; the frontend reads it from /api/v1/public-config.
    supabase_anon_key: str = ""
    # Legacy shared JWT secret (HS256). Only needed if the project still signs tokens with it.
    supabase_jwt_secret: str | None = None
    jwt_audience: str = "authenticated"
    # Vercel sets VERCEL=1. Serverless functions should not keep a connection pool.
    vercel: bool = False
    cors_origins: list[str] = []
    # Web push (VAPID). Generate a pair with scripts/generate_vapid_keys.py. Without them the app
    # still works; it just can't send notifications.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    # Contact for the push services: a mailto: address or the site URL.
    vapid_subject: str = "https://kita.madebyrazeen.com"
    # Vercel sends "Authorization: Bearer <CRON_SECRET>" with each scheduled call.
    cron_secret: str = ""

    @field_validator("database_url", "supabase_url", "supabase_anon_key", "supabase_jwt_secret",
                     "vapid_public_key", "vapid_private_key", "vapid_subject", "cron_secret", mode="before")
    @classmethod
    def _trim(cls, value):
        # Values pasted into a dashboard often pick up a trailing space or line break.
        return value.strip() if isinstance(value, str) else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
