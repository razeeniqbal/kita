from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.pool import NullPool

from app.config import get_settings


def sqlalchemy_url(raw: str) -> str:
    """Supabase hands out postgresql:// URLs; SQLAlchemy needs the psycopg 3 driver named."""
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    # prepare_threshold=None turns off server-side prepared statements, which Supabase's
    # transaction pooler (port 6543, used from Vercel) does not support.
    connect_args = {"connect_timeout": 15, "prepare_threshold": None}
    if settings.vercel:
        return create_engine(sqlalchemy_url(settings.database_url), poolclass=NullPool, connect_args=connect_args)
    return create_engine(
        sqlalchemy_url(settings.database_url),
        pool_size=5, max_overflow=5, pool_pre_ping=True, connect_args=connect_args,
    )


def get_db() -> Iterator[Connection]:
    """One connection and transaction per request. Handlers that write call db.commit();
    anything left uncommitted is rolled back when the connection closes."""
    with get_engine().connect() as conn:
        # The payment-vs-commitment rule is a deferred trigger; checking at each statement lets the
        # handler report it as a normal validation error instead of failing at commit.
        conn.execute(text("set constraints all immediate"))
        yield conn
