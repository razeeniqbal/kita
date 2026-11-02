"""Push notifications: devices turn them on and off here, and Vercel Cron calls the daily reminder."""
import datetime as dt
import hmac
from collections import defaultdict

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection

from app import push
from app.auth import AuthUser, current_user
from app.config import get_settings
from app.db import get_db
from app.deps import Member, get_member
from app.schemas import PushEndpoint, PushSubscription
from app.summaries import today
from app.tables import (calendar_events, expenses, payments, planning_events, push_subscriptions, tasks,
                        workspace_members)

router = APIRouter(tags=["notifications"])


def _prefs(row) -> dict:
    return {"partner_updates": row.partner_updates, "daily_digest": row.daily_digest}


@router.get("/push/config")
def push_config(user: AuthUser = Depends(current_user)):
    """The public key browsers subscribe with. Empty when the server has no keys yet."""
    return {"configured": push.configured(), "public_key": get_settings().vapid_public_key if push.configured() else ""}


@router.put("/push/subscription")
def save_subscription(body: PushSubscription, member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """Register this device, or update its choices. Omitted choices keep their current value."""
    if not push.allowed_endpoint(body.endpoint):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This browser's push service isn't supported.")
    choices = {k: v for k, v in (("partner_updates", body.partner_updates), ("daily_digest", body.daily_digest))
               if v is not None}
    owner = {"workspace_id": member.workspace_id, "user_id": member.user_id,
             "p256dh": body.keys.p256dh, "auth": body.keys.auth}
    stmt = insert(push_subscriptions).values(endpoint=body.endpoint, **owner, **choices)
    row = db.execute(stmt.on_conflict_do_update(index_elements=["endpoint"], set_={**owner, **choices})
                     .returning(push_subscriptions)).one()
    db.commit()
    return _prefs(row)


@router.post("/push/subscription/remove", status_code=status.HTTP_204_NO_CONTENT)
def remove_subscription(body: PushEndpoint, member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    db.execute(delete(push_subscriptions).where(push_subscriptions.c.endpoint == body.endpoint,
                                                push_subscriptions.c.user_id == member.user_id))
    db.commit()


@router.post("/push/test")
def send_test(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """Send a notification to every device the caller has turned on."""
    if not push.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Notifications aren't set up on the server yet.")
    subs = db.execute(select(push_subscriptions).where(push_subscriptions.c.user_id == member.user_id)).all()
    if not subs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turn on notifications on this device first.")
    sent = push.send(db, subs, {"title": "kita.", "body": "Notifications are on. You'll hear from us here.",
                                "url": "/settings", "tag": "test"})
    if not sent:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The push service didn't accept the test. Try turning "
                                                         "notifications off and on again.")
    return {"sent": sent}


# Daily reminder -----------------------------------------------------------------------------------

def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _more(n: int) -> str:
    return f" (+{n} more)" if n else ""


def digest(db: Connection, workspace_id, slot: int, day: dt.date) -> str | None:
    """One line about what needs this partner today, or None when there's nothing."""
    events = select(planning_events.c.id).where(planning_events.c.workspace_id == workspace_id)
    mine = (f"PARTNER_{slot}", "BOTH", "UNASSIGNED")
    due = db.execute(select(tasks.c.title, tasks.c.due_date).where(
        tasks.c.planning_event_id.in_(events), tasks.c.status.notin_(("DONE", "POSTPONED")),
        tasks.c.assignee.in_(mine), tasks.c.due_date <= day + dt.timedelta(days=2),
    ).order_by(tasks.c.due_date)).all()

    parts = []
    if len(due) == 1:
        t = due[0]
        when = "is overdue" if t.due_date < day else "is due today" if t.due_date == day else "is due soon"
        parts.append(f"“{t.title}” {when}")
    elif due:
        overdue = sum(t.due_date < day for t in due)
        today_ = sum(t.due_date == day for t in due)
        soon = len(due) - overdue - today_
        bits = [f"{overdue} overdue" if overdue else "", f"{today_} due today" if today_ else "",
                f"{soon} due in the next 2 days" if soon else ""]
        parts.append(f"{_plural(len(due), 'task')}: " + ", ".join(b for b in bits if b))

    cal = db.execute(select(calendar_events.c.title, calendar_events.c.start_time).where(
        calendar_events.c.planning_event_id.in_(events), calendar_events.c.event_date == day,
    ).order_by(calendar_events.c.start_time.asc().nulls_last())).all()
    if cal:
        first = cal[0]
        at = f" at {first.start_time.strftime('%I:%M %p').lstrip('0')}" if first.start_time else ""
        parts.append(f"Today: {first.title}{at}{_more(len(cal) - 1)}")

    paid = (select(payments.c.expense_id, func.sum(payments.c.amount_sen).label("paid"))
            .group_by(payments.c.expense_id).subquery())
    bills = db.execute(
        select(expenses.c.name, expenses.c.balance_due_date)
        .outerjoin(paid, paid.c.expense_id == expenses.c.id)
        .where(expenses.c.planning_event_id.in_(events),
               expenses.c.balance_due_date.between(day, day + dt.timedelta(days=3)),
               expenses.c.committed_sen > func.coalesce(paid.c.paid, 0))
        .order_by(expenses.c.balance_due_date)).all()
    if bills:
        b = bills[0]
        when = "today" if b.balance_due_date == day else b.balance_due_date.strftime("%a")
        parts.append(f"Balance for “{b.name}” due {when}{_more(len(bills) - 1)}")

    return " · ".join(parts) or None


@router.get("/cron/daily", include_in_schema=False)
def daily_reminder(authorization: str = Header(""), db: Connection = Depends(get_db)):
    """Called by Vercel Cron each morning (see vercel.json). Sends each partner one summary."""
    secret = get_settings().cron_secret
    if not secret or not push.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Daily reminders aren't set up.")
    if not hmac.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not allowed.")

    rows = db.execute(select(push_subscriptions, workspace_members.c.partner_slot).join(
        workspace_members, (workspace_members.c.workspace_id == push_subscriptions.c.workspace_id)
        & (workspace_members.c.user_id == push_subscriptions.c.user_id),
    ).where(push_subscriptions.c.daily_digest.is_(True))).all()
    people = defaultdict(list)
    for row in rows:
        people[(row.workspace_id, row.partner_slot)].append(row)

    day, sent = today(), 0
    for (workspace_id, slot), subs in people.items():
        body = digest(db, workspace_id, slot, day)
        if body:
            sent += push.send(db, subs, {"title": "Today in kita.", "body": body, "url": "/", "tag": "daily"})
    return {"people": len(people), "sent": sent}
