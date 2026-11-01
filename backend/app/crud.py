"""Row helpers shared by the routers. Every lookup is scoped to the caller's planning event, and
updates use the row's version number so a stale edit is refused instead of overwriting newer data."""
import uuid
from typing import Any

from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import Table, delete, insert, select, update
from sqlalchemy.engine import Connection

from app.deps import Event, Member
from app.tables import activity_log


def as_dict(row) -> dict[str, Any]:
    return dict(row._mapping)


def not_found(noun: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{noun.capitalize()} not found.")


def get_scoped(db: Connection, table: Table, event: Event, row_id: uuid.UUID, noun: str) -> dict[str, Any]:
    row = db.execute(select(table).where(table.c.id == row_id, table.c.planning_event_id == event.id)).first()
    if row is None:
        raise not_found(noun)
    return as_dict(row)


def insert_row(db: Connection, table: Table, values: dict[str, Any], member: Member) -> dict[str, Any]:
    if "created_by" in table.c:
        values = {**values, "created_by": member.user_id, "updated_by": member.user_id}
    return as_dict(db.execute(insert(table).values(**values).returning(table)).one())


def update_versioned(db: Connection, table: Table, where: list, row_id: uuid.UUID, version: int,
                     values: dict[str, Any], member: Member, noun: str) -> dict[str, Any]:
    """Apply values only if the row is still at `version`. Raises 409 with the current row otherwise."""
    if "updated_by" in table.c:
        values = {**values, "updated_by": member.user_id}
    stmt = (update(table).where(table.c.id == row_id, table.c.version == version, *where)
            .values(**values).returning(table))
    row = db.execute(stmt).first()
    if row is not None:
        return as_dict(row)
    current = db.execute(select(table).where(table.c.id == row_id, *where)).first()
    if current is None:
        raise not_found(noun)
    raise HTTPException(status.HTTP_409_CONFLICT, {
        "message": f"This {noun} was changed by someone else while you were editing. "
                   "Review the latest version and make your change again.",
        "current": jsonable_encoder(as_dict(current)),
    })


def update_scoped(db: Connection, table: Table, event: Event, row_id: uuid.UUID, version: int,
                  values: dict[str, Any], member: Member, noun: str) -> dict[str, Any]:
    return update_versioned(db, table, [table.c.planning_event_id == event.id], row_id, version, values, member, noun)


def delete_scoped(db: Connection, table: Table, event: Event, row_id: uuid.UUID, noun: str) -> dict[str, Any]:
    row = db.execute(delete(table).where(table.c.id == row_id, table.c.planning_event_id == event.id)
                     .returning(table)).first()
    if row is None:
        raise not_found(noun)
    return as_dict(row)


def log(db: Connection, member: Member, event_id: uuid.UUID | None, action: str, entity_type: str,
        entity_id: uuid.UUID | None, summary: str) -> None:
    db.execute(insert(activity_log).values(
        workspace_id=member.workspace_id, planning_event_id=event_id, actor_user_id=member.user_id,
        action=action, entity_type=entity_type, entity_id=entity_id, summary=summary,
    ))
