from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Read from environment variables, falling back to backend/.env for local development."""

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str
    # Project URL, e.g. https://<project-ref>.supabase.co. Used to fetch the JWT signing keys.
    supabase_url: str = ""
    # Legacy shared JWT secret (HS256). Only needed if the project still signs tokens with it.
    supabase_jwt_secret: str | None = None
    jwt_audience: str = "authenticated"
    # Vercel sets VERCEL=1. Serverless functions should not keep a connection pool.
    vercel: bool = False
    cors_origins: list[str] = []


@lru_cache
def get_settings() -> Settings:
    return Settings()
