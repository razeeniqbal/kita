"""Home Screen widget (Scriptable on iPhone): each person makes a read-only key in Settings, and the
widget sends it as X-Widget-Key to fetch a short summary. The key can't change anything."""
import datetime as dt
import hashlib
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection

from app.db import get_db
from app.deps import Member, get_member
from app.summaries import MODE_LABEL, budget_summary, progress, today
from app.tables import planning_events, tasks, widget_keys, workspace_members

router = APIRouter(prefix="/widget", tags=["widget"])


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.get("/key")
def key_status(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """Whether this person has a widget key, and the key itself so Settings can copy any style's script."""
    row = db.execute(select(widget_keys.c.key, widget_keys.c.created_at, widget_keys.c.last_used_at)
                     .where(widget_keys.c.user_id == member.user_id)).first()
    return {"exists": row is not None, "key": row and row.key, "created_at": row and row.created_at,
            "last_used_at": row and row.last_used_at}


@router.post("/key")
def make_key(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """A new key. Any earlier key for this person stops working."""
    key = secrets.token_urlsafe(32)
    values = {"workspace_id": member.workspace_id, "key": key, "key_hash": _hash(key), "created_at": dt.datetime.now(dt.UTC),
              "last_used_at": None}
    db.execute(insert(widget_keys).values(user_id=member.user_id, **values)
               .on_conflict_do_update(index_elements=["user_id"], set_=values))
    db.commit()
    return {"key": key}


@router.delete("/key", status_code=status.HTTP_204_NO_CONTENT)
def remove_key(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    db.execute(delete(widget_keys).where(widget_keys.c.user_id == member.user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/summary")
def summary(x_widget_key: str = Header(""), db: Connection = Depends(get_db)):
    """Both modes' date, countdown, progress and what's left to pay, plus this person's next tasks."""
    owner = db.execute(update(widget_keys).where(widget_keys.c.key_hash == _hash(x_widget_key))
                       .values(last_used_at=dt.datetime.now(dt.UTC))
                       .returning(widget_keys.c.workspace_id, widget_keys.c.user_id)).first() if x_widget_key else None
    if owner is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This widget key was turned off. Make a new one in Settings.")
    db.commit()
    return _summary(db, owner.workspace_id, owner.user_id)


@router.get("/preview")
def preview(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """The same data the widget shows, for the style previews in Settings."""
    return _summary(db, member.workspace_id, member.user_id)


def _summary(db: Connection, workspace_id, user_id) -> dict:
    slot = db.scalar(select(workspace_members.c.partner_slot).where(workspace_members.c.user_id == user_id))
    day = today()
    events = db.execute(select(planning_events).where(planning_events.c.workspace_id == workspace_id)
                        .order_by(planning_events.c.mode)).all()   # enum order: TUNANG first
    open_tasks = db.execute(
        select(tasks.c.title, tasks.c.due_date, planning_events.c.mode)
        .join(planning_events, planning_events.c.id == tasks.c.planning_event_id)
        .where(planning_events.c.workspace_id == workspace_id,
               tasks.c.status.in_(("NOT_STARTED", "IN_PROGRESS")), tasks.c.due_date.is_not(None),
               tasks.c.assignee.in_((f"PARTNER_{slot}", "BOTH", "UNASSIGNED")))
        .order_by(tasks.c.due_date).limit(3)).all()
    budgets = {e.id: budget_summary(db, e.id) for e in events}
    return {
        "today": day,
        "events": [{
            "mode": e.mode, "label": MODE_LABEL[e.mode], "name": e.event_name, "date": e.target_date,
            "days": (e.target_date - day).days if e.target_date else None,
            "percent": progress(db, e.id)["percent"],
            "paid_sen": budgets[e.id]["paid_sen"], "cost_sen": budgets[e.id]["cost_sen"],
            "left_to_pay_sen": budgets[e.id]["left_to_pay_sen"],
        } for e in events],
        "tasks": [{"title": t.title, "due": t.due_date, "mode": MODE_LABEL[t.mode], "overdue": t.due_date < day}
                  for t in open_tasks],
    }
