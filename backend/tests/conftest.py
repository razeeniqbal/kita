"""Test setup. Tests run against a throwaway local PostgreSQL, never against Supabase:

    docker run -d --name kita-test-db -e POSTGRES_PASSWORD=kita-test -e POSTGRES_DB=kita_test \
        -p 127.0.0.1:54329:5432 postgres:17-alpine

The schema is rebuilt from supabase/migrations at the start of the run and every table is
emptied after each test."""
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import jwt
import psycopg
import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:kita-test@127.0.0.1:54329/kita_test")
JWT_SECRET = "pytest-only-secret-not-used-anywhere-else"

if urlparse(TEST_DATABASE_URL).hostname not in ("127.0.0.1", "localhost"):
    pytest.exit("Refusing to run: TEST_DATABASE_URL must point at a local database, the tests empty every table.")

# Environment variables take priority over backend/.env, so the app never sees the real database.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SUPABASE_JWT_SECRET"] = JWT_SECRET
os.environ["SUPABASE_URL"] = ""
os.environ.pop("VERCEL", None)

REPO = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((REPO / "supabase" / "migrations").glob("*.sql"))
SEED = REPO / "supabase" / "seed.sql"


@pytest.fixture(scope="session")
def schema():
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        conn.execute("drop schema if exists kita cascade")
        conn.execute("drop schema if exists auth cascade")
        conn.execute((Path(__file__).parent / "supabase_stub.sql").read_text(encoding="utf-8"))
        for path in MIGRATIONS:
            conn.execute(path.read_text(encoding="utf-8"))
    yield


@pytest.fixture()
def pg(schema):
    """Direct connection for arranging data and checking results."""
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        yield conn
        conn.execute("truncate kita.workspaces, auth.users restart identity cascade")


@dataclass
class World:
    workspace: uuid.UUID
    tunang: uuid.UUID
    perkahwinan: uuid.UUID
    razeen: uuid.UUID
    sabrina: uuid.UUID
    outsider: uuid.UUID          # member of a different workspace
    outsider_event: uuid.UUID
    stranger: uuid.UUID          # signed in, but in no workspace


def _user(pg, email: str) -> uuid.UUID:
    uid = uuid.uuid4()
    pg.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email))
    return uid


def _workspace(pg, name: str, members: list[tuple[uuid.UUID, int]]) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    ws = pg.execute("insert into kita.workspaces (name, partner_1_name, partner_2_name) values (%s, 'Razeen', 'Sabrina') "
                    "returning id", (name,)).fetchone()[0]
    tun = pg.execute("insert into kita.planning_events (workspace_id, mode, event_name) values (%s, 'TUNANG', "
                     "'Majlis Tunang') returning id", (ws,)).fetchone()[0]
    per = pg.execute("insert into kita.planning_events (workspace_id, mode, event_name) values (%s, 'PERKAHWINAN', "
                     "'Majlis Perkahwinan') returning id", (ws,)).fetchone()[0]
    for uid, slot in members:
        pg.execute("insert into kita.workspace_members (workspace_id, user_id, partner_slot) values (%s, %s, %s)",
                   (ws, uid, slot))
    return ws, tun, per


@pytest.fixture()
def world(pg) -> World:
    razeen, sabrina = _user(pg, "razeen@example.test"), _user(pg, "sabrina@example.test")
    outsider, stranger = _user(pg, "outsider@example.test"), _user(pg, "stranger@example.test")
    ws, tun, per = _workspace(pg, "Razeen & Sabrina", [(razeen, 1), (sabrina, 2)])
    _, other_tun, _ = _workspace(pg, "Someone else", [(outsider, 1)])
    return World(ws, tun, per, razeen, sabrina, outsider, other_tun, stranger)


@pytest.fixture(scope="session")
def client(schema):
    from fastapi.testclient import TestClient

    from app.main import app
    return TestClient(app)


def token(user_id: uuid.UUID, *, expires_in: int = 3600) -> str:
    claims = {"sub": str(user_id), "aud": "authenticated", "role": "authenticated",
              "exp": int(time.time()) + expires_in, "email": "user@example.test"}
    return jwt.encode(claims, JWT_SECRET, algorithm="HS256")


def auth(user_id: uuid.UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(user_id)}"}
