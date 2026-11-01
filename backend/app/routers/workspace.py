"""Who am I, the shared workspace, and the activity log."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.engine import Connection

from app.auth import AuthUser, current_user
from app.crud import as_dict, log, update_versioned
from app.db import get_db
from app.deps import Member, get_member
from app.schemas import WorkspaceUpdate, changes
from app.tables import activity_log, planning_events, workspace_members, workspaces

router = APIRouter(tags=["workspace"])


@router.get("/me")
def me(user: AuthUser = Depends(current_user), db: Connection = Depends(get_db)):
    """Works for any signed-in user, so the app can show 'not invited yet' instead of an error."""
    membership = db.execute(select(workspace_members).where(workspace_members.c.user_id == user.id)).first()
    workspace = None
    if membership is not None:
        workspace = as_dict(db.execute(select(workspaces).where(workspaces.c.id == membership.workspace_id)).one())
    return {
        "user": {"id": user.id, "email": user.email},
        "membership": None if membership is None else {
            "workspace_id": membership.workspace_id, "partner_slot": membership.partner_slot,
            "partner": f"PARTNER_{membership.partner_slot}", "role": membership.role,
        },
        "workspace": workspace,
    }


@router.get("/workspaces/current")
def current_workspace(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    workspace = as_dict(db.execute(select(workspaces).where(workspaces.c.id == member.workspace_id)).one())
    members = db.execute(select(workspace_members.c.user_id, workspace_members.c.partner_slot, workspace_members.c.role)
                         .where(workspace_members.c.workspace_id == member.workspace_id)
                         .order_by(workspace_members.c.partner_slot))
    events = db.execute(select(planning_events.c.id, planning_events.c.mode, planning_events.c.event_name)
                        .where(planning_events.c.workspace_id == member.workspace_id).order_by(planning_events.c.mode))
    return {**workspace, "members": [as_dict(m) for m in members], "planning_events": [as_dict(e) for e in events]}


@router.patch("/workspaces/current")
def update_workspace(body: WorkspaceUpdate, member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    row = update_versioned(db, workspaces, [workspaces.c.id == member.workspace_id], member.workspace_id,
                           body.version, changes(body), member, "workspace")
    log(db, member, None, "workspace.updated", "workspace", row["id"], "updated the workspace names")
    db.commit()
    return row


@router.get("/activity")
def activity(member: Member = Depends(get_member), db: Connection = Depends(get_db),
             planning_event_id: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=200)):
    stmt = (select(activity_log).where(activity_log.c.workspace_id == member.workspace_id)
            .order_by(activity_log.c.created_at.desc(), activity_log.c.id.desc()).limit(limit))
    if planning_event_id is not None:
        stmt = stmt.where(activity_log.c.planning_event_id == planning_event_id)
    return [as_dict(r) for r in db.execute(stmt)]
