"""Authorization. Every workspace route depends on get_member; every mode-scoped route on get_event,
which only finds planning events in the caller's own workspace. A forged id therefore returns 404."""
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.engine import Connection

from app.auth import AuthUser, current_user
from app.db import get_db
from app.tables import planning_events, workspace_members


@dataclass(frozen=True)
class Member:
    user_id: uuid.UUID
    workspace_id: uuid.UUID
    partner_slot: int
    role: str


@dataclass(frozen=True)
class Event:
    id: uuid.UUID
    workspace_id: uuid.UUID
    mode: str


def get_member(user: AuthUser = Depends(current_user), db: Connection = Depends(get_db)) -> Member:
    row = db.execute(select(workspace_members).where(workspace_members.c.user_id == user.id)).first()
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has not been added to a kita workspace.")
    return Member(row.user_id, row.workspace_id, row.partner_slot, row.role)


def get_event(event_id: uuid.UUID, member: Member = Depends(get_member), db: Connection = Depends(get_db)) -> Event:
    row = db.execute(
        select(planning_events.c.id, planning_events.c.workspace_id, planning_events.c.mode)
        .where(planning_events.c.id == event_id, planning_events.c.workspace_id == member.workspace_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Planning event not found.")
    return Event(row.id, row.workspace_id, row.mode)
