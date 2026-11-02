"""Copy kita from one Supabase project to another, e.g. to move it to a closer region.

Reads two connection strings from backend/.env (session pooler URLs, port 5432):
    SOURCE_DATABASE_URL   the project to copy from (defaults to DATABASE_URL)
    TARGET_DATABASE_URL   the new, empty project

What it does, in ONE transaction on the target (all or nothing):
  1. applies every file in supabase/migrations, and records them as applied
  2. copies sign-in accounts (auth.users and auth.identities) with the same ids and password
     hashes, so everyone keeps their password
  3. copies every kita table, parents before children
  4. checks row counts match the source before committing

The source is only read. Run without arguments for a dry run (counts only), then with --apply:
    python scripts/copy_supabase_project.py
    python scripts/copy_supabase_project.py --apply
"""
import sys
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[1]

# Parents before children, so foreign keys are satisfied as rows arrive.
KITA_TABLES = [
    "workspaces", "workspace_members", "planning_events", "budget_categories", "vendors", "vendor_bookings",
    "expenses", "payments", "tasks", "hantaran_items", "calendar_events", "guests", "notes", "documents",
    "activity_log",
]
AUTH_TABLES = ["users", "identities"]


def env() -> dict[str, str]:
    values = {}
    for line in (ROOT / "backend" / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def writable_columns(conn: psycopg.Connection, schema: str, table: str) -> dict[str, str]:
    """Column -> type for columns that can be inserted (not generated)."""
    rows = conn.execute(
        """select column_name, udt_name from information_schema.columns
           where table_schema = %s and table_name = %s and is_generated = 'NEVER'
           order by ordinal_position""", (schema, table)).fetchall()
    return dict(rows)


def copy_table(src: psycopg.Connection, dst: psycopg.Connection, schema: str, table: str) -> int:
    src_cols = writable_columns(src, schema, table)
    dst_cols = writable_columns(dst, schema, table)
    cols = [c for c in src_cols if c in dst_cols]
    rows = src.execute(sql.SQL("select {} from {}.{}").format(
        sql.SQL(", ").join(map(sql.Identifier, cols)), sql.Identifier(schema), sql.Identifier(table))).fetchall()
    if not rows:
        return 0
    json_cols = {i for i, c in enumerate(cols) if dst_cols[c] in ("json", "jsonb")}
    overriding = sql.SQL(" overriding system value") if (schema, table) == ("kita", "activity_log") else sql.SQL("")
    insert = sql.SQL("insert into {}.{} ({}){} values ({})").format(
        sql.Identifier(schema), sql.Identifier(table), sql.SQL(", ").join(map(sql.Identifier, cols)), overriding,
        sql.SQL(", ").join(sql.Placeholder() * len(cols)))
    data = [tuple(Jsonb(v) if i in json_cols and v is not None else v for i, v in enumerate(r)) for r in rows]
    if (schema, table) == ("kita", "guests"):
        # Guests can point at the guest they were copied from: insert without that link, then restore it.
        link = cols.index("copied_from_guest_id")
        dst.cursor().executemany(insert, [tuple(None if i == link else v for i, v in enumerate(r)) for r in data])
        for r in data:
            if r[link] is not None:
                dst.execute("update kita.guests set copied_from_guest_id = %s where id = %s", (r[link], r[cols.index("id")]))
    else:
        dst.cursor().executemany(insert, data)
    return len(rows)


def count(conn: psycopg.Connection, schema: str, table: str) -> int:
    return conn.execute(sql.SQL("select count(*) from {}.{}").format(sql.Identifier(schema), sql.Identifier(table))).fetchone()[0]


def main() -> None:
    apply = "--apply" in sys.argv
    e = env()
    source_url = e.get("SOURCE_DATABASE_URL") or e["DATABASE_URL"]
    target_url = e.get("TARGET_DATABASE_URL")
    if not target_url:
        sys.exit("Add TARGET_DATABASE_URL (the new project's session pooler URL) to backend/.env first.")
    if source_url == target_url:
        sys.exit("Source and target are the same database.")

    with psycopg.connect(source_url, connect_timeout=20, options="-c default_transaction_read_only=on") as src, \
         psycopg.connect(target_url, connect_timeout=20) as dst:
        src_host = src.info.host
        dst_host = dst.info.host
        print(f"source: {src_host}\ntarget: {dst_host}")
        if dst.execute("select to_regnamespace('kita') is not null").fetchone()[0]:
            sys.exit("The target already has a kita schema. Use an empty project.")
        if count(dst, "auth", "users"):
            sys.exit("The target already has sign-in accounts. Use an empty project.")
        plan = {f"auth.{t}": count(src, "auth", t) for t in AUTH_TABLES} | {f"kita.{t}": count(src, "kita", t) for t in KITA_TABLES}
        for name, n in plan.items():
            print(f"  {name:28} {n:>5} rows")
        if not apply:
            print("\nDry run only. Run again with --apply to copy.")
            return

        migrations = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
        with dst.transaction():
            for path in migrations:
                dst.execute(path.read_text(encoding="utf-8"))
            dst.execute("create schema if not exists supabase_migrations")
            dst.execute("create table if not exists supabase_migrations.schema_migrations "
                        "(version text primary key, statements text[], name text)")
            for path in migrations:
                version, _, name = path.stem.partition("_")
                dst.execute("insert into supabase_migrations.schema_migrations (version, name, statements) values (%s, %s, %s)",
                            (version, name, [path.read_text(encoding="utf-8")]))
            print(f"\napplied {len(migrations)} migrations")
            for t in AUTH_TABLES:
                print(f"  copied auth.{t:21} {copy_table(src, dst, 'auth', t):>5}")
            for t in KITA_TABLES:
                print(f"  copied kita.{t:21} {copy_table(src, dst, 'kita', t):>5}")
            dst.execute("select setval(pg_get_serial_sequence('kita.activity_log', 'id'), "
                        "coalesce((select max(id) from kita.activity_log), 0) + 1, false)")
            dst.execute("set constraints all immediate")   # run the deferred payment checks now
            mismatched = [n for n in plan if count(dst, *n.split(".")) != plan[n]]
            if mismatched:
                raise RuntimeError(f"Row counts differ for {mismatched}; nothing was committed.")
        print("\nCommitted. Every table matches the source.")


if __name__ == "__main__":
    main()
