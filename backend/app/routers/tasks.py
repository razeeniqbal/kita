"""Checklist tasks, including the confirmed move to the other mode (spec section 4)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.engine import Connection

from app.crud import as_dict, log, update_versioned
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.routers.factory import register_crud
from app.schemas import Assignee, TaskCreate, TaskStatus, TaskUpdate, VersionOnly
from app.summaries import MODE_LABEL
from app.tables import hantaran_items, planning_events, tasks

router = APIRouter(prefix="/planning-events/{event_id}/tasks", tags=["tasks"])


@router.get("")
def list_tasks(event: Event = Depends(get_event), db: Connection = Depends(get_db),
               status_filter: TaskStatus | None = Query(None, alias="status"), open_only: bool = False,
               assignee: Assignee | None = None, category: str | None = None):
    stmt = select(tasks).where(tasks.c.planning_event_id == event.id)
    if status_filter:
        stmt = stmt.where(tasks.c.status == status_filter)
    if open_only:
        stmt = stmt.where(tasks.c.status != "DONE")
    if assignee:
        stmt = stmt.where(tasks.c.assignee == assignee)
    if category:
        stmt = stmt.where(tasks.c.category == category)
    stmt = stmt.order_by(tasks.c.sort_order, tasks.c.due_date.asc().nulls_last(), tasks.c.created_at)
    return [as_dict(r) for r in db.execute(stmt)]


def _describe(row: dict, values: dict) -> str:
    if values.get("status") == "DONE":
        return f"completed “{row['title']}”"
    if "status" in values:
        return f"set “{row['title']}” to {row['status'].replace('_', ' ').lower()}"
    return f"updated task “{row['title']}”"


register_crud(router, "", tasks, "task", TaskCreate, TaskUpdate, with_list=False, describe_update=_describe)


@router.post("/{item_id}/move")
def move_task(item_id: uuid.UUID, body: VersionOnly, event: Event = Depends(get_event),
              member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """Move a task to the other mode. Its cost link is cleared, because costs never cross modes,
    and it lands in the 'Lain-lain' section there. The move is recorded in the activity log."""
    target = db.execute(select(planning_events.c.id, planning_events.c.mode).where(
        planning_events.c.workspace_id == event.workspace_id, planning_events.c.mode != event.mode)).first()
    if target is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The other planning mode has not been set up yet.")
    # Hantaran items in this mode may point at the task; links never cross modes, so release them.
    db.execute(update(hantaran_items).where(hantaran_items.c.task_id == item_id,
                                            hantaran_items.c.planning_event_id == event.id).values(task_id=None))
    row = update_versioned(
        db, tasks, [tasks.c.planning_event_id == event.id], item_id, body.version,
        {"planning_event_id": target.id, "moved_from_event_id": event.id, "expense_id": None, "category": "Lain-lain"},
        member, "task",
    )
    summary = f"moved “{row['title']}” from {MODE_LABEL[event.mode]} to {MODE_LABEL[target.mode]}"
    log(db, member, event.id, "task.moved", "task", row["id"], summary)
    log(db, member, target.id, "task.moved", "task", row["id"], summary)
    db.commit()
    return row
