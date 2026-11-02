from collections.abc import Iterator
from functools import lru_cache
from urllib.parse import urlsplit

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.pool import NullPool

from app.config import get_settings


class DatabaseConfigError(Exception):
    """DATABASE_URL cannot be used. The message never contains the URL or password."""


def describe_url_problem(raw: str, *, serverless: bool = False) -> str | None:
    """A plain-English reason why a Supabase connection string can't work, or None if it looks fine.
    Only describes the shape of the value; never repeats it."""
    if not raw:
        return "it is empty"
    if raw != raw.strip():
        return "it has a space or line break at the start or end"
    if raw[0] in "\"'" or raw[-1] in "\"'":
        return "it is wrapped in quotes"
    if any(ch.isspace() for ch in raw):
        return "it contains a space or line break"
    if not raw.startswith(("postgresql://", "postgres://")):
        return "it should start with postgresql://"
    if "[" in raw or "]" in raw or "YOUR-PASSWORD" in raw.upper() or "YOURPASSWORD" in raw.upper():
        return "the password placeholder (or its square brackets) is still in it"
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError:
        return "it can't be read; if the password contains @, :, / or #, generate a new password without them"
    if not parts.password:
        return "it has no password"
    if not parts.hostname:
        return "it has no server address"
    if "pooler.supabase.com" in parts.hostname and "." not in (parts.username or ""):
        return "with the pooler, the user must be postgres.<project-id>, including the dot"
    if parts.hostname.startswith("db.") and parts.hostname.endswith(".supabase.co"):
        return "it uses the direct db.<project>.supabase.co address, which Vercel can't reach; use the pooler address"
    if serverless and "pooler.supabase.com" in parts.hostname and port != 6543:
        return "on Vercel use the transaction pooler port 6543"
    if (parts.path or "/").strip("/") == "":
        return "it is missing the database name (/postgres)"
    return None


def sqlalchemy_url(raw: str) -> str:
    """Supabase hands out postgresql:// URLs; SQLAlchemy needs the psycopg 3 driver named."""
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    problem = describe_url_problem(settings.database_url, serverless=settings.vercel)
    if problem:
        raise DatabaseConfigError(f"The DATABASE_URL setting can't be used: {problem}.")
    # prepare_threshold=None turns off server-side prepared statements, which Supabase's
    # transaction pooler (port 6543, used from Vercel) does not support.
    connect_args = {"connect_timeout": 15, "prepare_threshold": None}
    try:
        if settings.vercel:
            return create_engine(sqlalchemy_url(settings.database_url), poolclass=NullPool, connect_args=connect_args)
        return create_engine(
            sqlalchemy_url(settings.database_url),
            pool_size=5, max_overflow=5, pool_pre_ping=True, connect_args=connect_args,
        )
    except Exception as exc:  # SQLAlchemy's parse errors repeat the URL, so don't pass them on
        raise DatabaseConfigError(f"The DATABASE_URL setting can't be read ({type(exc).__name__}).") from None


def get_db() -> Iterator[Connection]:
    """One connection and transaction per request. Handlers that write call db.commit();
    anything left uncommitted is rolled back when the connection closes."""
    with get_engine().connect() as conn:
        # The payment-vs-commitment rule is a deferred trigger; checking at each statement lets the
        # handler report it as a normal validation error instead of failing at commit.
        conn.execute(text("set constraints all immediate"))
        yield conn
