"""Figures shown on dashboards. Every function reads one planning event only, so nothing from
the other mode is ever counted (spec section 4)."""
import datetime as dt
import uuid

from sqlalchemy import case, func, select
from sqlalchemy.engine import Connection

from app.crud import as_dict
from app.tables import calendar_events, expenses, payments, planning_events, tasks

MALAYSIA = dt.timezone(dt.timedelta(hours=8))   # Asia/Kuala_Lumpur, no daylight saving
MODE_LABEL = {"TUNANG": "Tunang", "PERKAHWINAN": "Perkahwinan"}


def today() -> dt.date:
    return dt.datetime.now(MALAYSIA).date()


def progress(db: Connection, event_id: uuid.UUID) -> dict:
    counts = dict(db.execute(select(tasks.c.status, func.count())
                             .where(tasks.c.planning_event_id == event_id).group_by(tasks.c.status)).all())
    total = sum(counts.values())
    done = counts.get("DONE", 0)
    return {
        "total": total, "done": done,
        "in_progress": counts.get("IN_PROGRESS", 0), "not_started": counts.get("NOT_STARTED", 0),
        "postponed": counts.get("POSTPONED", 0),
        "percent": round(done * 100 / total) if total else 0,
    }


def paid_per_expense(event_id: uuid.UUID):
    return (select(payments.c.expense_id, func.sum(payments.c.amount_sen).label("paid"))
            .join(expenses, expenses.c.id == payments.c.expense_id)
            .where(expenses.c.planning_event_id == event_id)
            .group_by(payments.c.expense_id))


def budget_summary(db: Connection, event_id: uuid.UUID) -> dict:
    """Remaining to allocate = target - planned; outstanding = committed - paid (spec 5.3)."""
    target = db.scalar(select(planning_events.c.target_budget_sen).where(planning_events.c.id == event_id)) or 0
    planned, committed = db.execute(
        select(func.coalesce(func.sum(expenses.c.planned_sen), 0), func.coalesce(func.sum(expenses.c.committed_sen), 0))
        .where(expenses.c.planning_event_id == event_id)
    ).one()
    by_payer = {payer: int(total) for payer, total in db.execute(
        select(payments.c.paid_by, func.sum(payments.c.amount_sen))
        .join(expenses, expenses.c.id == payments.c.expense_id)
        .where(expenses.c.planning_event_id == event_id).group_by(payments.c.paid_by)
    ).all()}
    planned, committed, paid = int(planned), int(committed), sum(by_payer.values())
    # The simple view: each line costs its agreed price, or its estimate until a price is agreed.
    paid_each = paid_per_expense(event_id).subquery()
    cost = case((expenses.c.committed_sen > 0, expenses.c.committed_sen), else_=expenses.c.planned_sen)
    total_cost, left_to_pay = db.execute(
        select(func.coalesce(func.sum(cost), 0),
               func.coalesce(func.sum(func.greatest(cost - func.coalesce(paid_each.c.paid, 0), 0)), 0))
        .outerjoin(paid_each, paid_each.c.expense_id == expenses.c.id)
        .where(expenses.c.planning_event_id == event_id)
    ).one()
    return {
        "cost_sen": int(total_cost), "left_to_pay_sen": int(left_to_pay),
        "target_sen": int(target), "planned_sen": planned, "committed_sen": committed, "paid_sen": paid,
        "remaining_to_allocate_sen": int(target) - planned, "outstanding_sen": committed - paid,
        "paid_by": by_payer,
    }


def calendar_items(db: Connection, event_id: uuid.UUID) -> list[dict]:
    """Manual calendar events plus dates that come from other records: the event day,
    open task due dates and balances still to pay."""
    ev = db.execute(select(planning_events).where(planning_events.c.id == event_id)).one()
    base = {"planning_event_id": ev.id, "mode": ev.mode}
    items: list[dict] = []
    if ev.target_date:
        items.append({**base, "date": ev.target_date, "time": None, "kind": "EVENT_DAY",
                      "title": ev.event_name, "detail": "", "ref": None})
    for row in db.execute(select(calendar_events).where(calendar_events.c.planning_event_id == event_id)):
        items.append({**base, "date": row.event_date, "time": row.start_time, "kind": row.type,
                      "title": row.title, "detail": row.location,
                      "ref": {"type": "calendar_event", "id": row.id, "version": row.version}})
    for row in db.execute(select(tasks).where(tasks.c.planning_event_id == event_id, tasks.c.due_date.is_not(None),
                                              tasks.c.status.in_(["NOT_STARTED", "IN_PROGRESS"]))):
        items.append({**base, "date": row.due_date, "time": None, "kind": "TASK_DUE", "title": row.title,
                      "detail": row.assignee, "ref": {"type": "task", "id": row.id, "version": row.version}})
    paid = paid_per_expense(event_id).subquery()
    for row in db.execute(
        select(expenses, func.coalesce(paid.c.paid, 0).label("paid_sen"))
        .outerjoin(paid, paid.c.expense_id == expenses.c.id)
        .where(expenses.c.planning_event_id == event_id, expenses.c.balance_due_date.is_not(None))
    ):
        balance = row.committed_sen - int(row.paid_sen)
        if balance > 0:
            items.append({**base, "date": row.balance_due_date, "time": None, "kind": "PAYMENT_DUE",
                          "title": row.name, "detail": balance,
                          "ref": {"type": "expense", "id": row.id, "version": row.version}})
    items.sort(key=lambda i: (i["date"], i["time"] or dt.time.max))
    return items


def next_actions(db: Connection, event_id: uuid.UUID, limit: int = 5) -> list[dict]:
    """Open tasks, nearest due date first, then highest priority (enum order is LOW < NORMAL < HIGH)."""
    rows = db.execute(
        select(tasks).where(tasks.c.planning_event_id == event_id, tasks.c.status.in_(["NOT_STARTED", "IN_PROGRESS"]))
        .order_by(tasks.c.due_date.asc().nulls_last(), tasks.c.priority.desc(), tasks.c.sort_order)
        .limit(limit)
    )
    return [as_dict(r) for r in rows]
