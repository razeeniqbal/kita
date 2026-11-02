"""Hantaran: items exchanged on dulang (trays) for one mode, each optionally linked to a budget
expense (its cost) and a checklist task. Links can only point inside the same mode."""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select, update
from sqlalchemy.engine import Connection

from app.crud import as_dict, get_scoped, insert_row, log
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.routers.factory import register_crud
from app.schemas import HantaranCost, HantaranCreate, HantaranUpdate
from app.summaries import paid_per_expense
from app.tables import budget_categories, expenses, hantaran_items, tasks

router = APIRouter(prefix="/planning-events/{event_id}/hantaran", tags=["hantaran"])

# Budget category a new hantaran cost goes into, by mode (from supabase/seed.sql).
HANTARAN_CATEGORY = {"TUNANG": "Hantaran & dulang", "PERKAHWINAN": "Hantaran"}


@router.get("")
def list_hantaran(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    """Items with their linked cost and task, plus a summary per giving side."""
    paid = paid_per_expense(event.id).subquery()
    rows = db.execute(
        select(hantaran_items,
               expenses.c.name.label("expense_name"), expenses.c.planned_sen, expenses.c.committed_sen,
               func.coalesce(paid.c.paid, 0).label("paid_sen"),
               tasks.c.title.label("task_title"), tasks.c.status.label("task_status"))
        .outerjoin(expenses, expenses.c.id == hantaran_items.c.expense_id)
        .outerjoin(paid, paid.c.expense_id == hantaran_items.c.expense_id)
        .outerjoin(tasks, tasks.c.id == hantaran_items.c.task_id)
        .where(hantaran_items.c.planning_event_id == event.id)
        .order_by(hantaran_items.c.giver, hantaran_items.c.tray_number.asc().nulls_last(),
                  hantaran_items.c.sort_order, hantaran_items.c.name)
    )
    items = [{**as_dict(r), "paid_sen": int(r.paid_sen)} for r in rows]
    sides = {}
    for side in ("PARTNER_1", "PARTNER_2"):
        mine = [i for i in items if i["giver"] == side]
        sides[side] = {
            "items": len(mine),
            "trays": len({i["tray_number"] for i in mine if i["tray_number"] is not None}),
            "ready": sum(1 for i in mine if i["status"] == "READY"),
        }
    # Cost counts each linked expense once, even if several items share it.
    linked = {i["expense_id"]: i for i in items if i["expense_id"]}.values()
    summary = {
        "sides": sides,
        "items": len(items),
        "ready": sum(1 for i in items if i["status"] == "READY"),
        "planned_sen": sum(int(i["planned_sen"] or 0) for i in linked),
        "committed_sen": sum(int(i["committed_sen"] or 0) for i in linked),
        "paid_sen": sum(i["paid_sen"] for i in linked),
    }
    return {"items": items, "summary": summary}


def _new_expense(db: Connection, event: Event, member: Member, name: str, cost_sen: int) -> dict:
    """A budget line for a hantaran item, in the mode's Hantaran category."""
    category_id = db.scalar(select(budget_categories.c.id).where(
        budget_categories.c.planning_event_id == event.id,
        budget_categories.c.name == HANTARAN_CATEGORY[event.mode]))
    return insert_row(db, expenses, {"planning_event_id": event.id, "name": f"Hantaran: {name}",
                                     "category_id": category_id, "planned_sen": cost_sen}, member)


@router.post("", status_code=status.HTTP_201_CREATED)
def add_hantaran(body: HantaranCreate, event: Event = Depends(get_event), member: Member = Depends(get_member),
                 db: Connection = Depends(get_db)):
    values = body.model_dump(exclude={"create_expense", "planned_sen"})
    if body.create_expense and values["expense_id"] is None:
        values["expense_id"] = _new_expense(db, event, member, body.name, body.planned_sen)["id"]
    row = insert_row(db, hantaran_items, {**values, "planning_event_id": event.id}, member)
    log(db, member, event.id, "hantaran.created", "hantaran", row["id"],
        f"added hantaran “{row['name']}”" + (" with a budget line" if body.create_expense else ""))
    db.commit()
    return row


@router.put("/{item_id}/cost")
def set_cost(item_id: uuid.UUID, body: HantaranCost, event: Event = Depends(get_event),
             member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """Give an item a cost: adds its budget line if it has none, otherwise changes that line's amount
    (and its agreed price, if one was recorded, so the Budget page shows the same number)."""
    item = get_scoped(db, hantaran_items, event, item_id, "hantaran item")
    if item["expense_id"] is None:
        expense = _new_expense(db, event, member, item["name"], body.cost_sen)
        db.execute(update(hantaran_items).where(hantaran_items.c.id == item_id)
                   .values(expense_id=expense["id"], updated_by=member.user_id))
        summary = f"added a cost for hantaran “{item['name']}”"
    else:
        committed = db.scalar(select(expenses.c.committed_sen).where(expenses.c.id == item["expense_id"]))
        values = {"planned_sen": body.cost_sen, "updated_by": member.user_id}
        if committed:
            values["committed_sen"] = body.cost_sen
        db.execute(update(expenses).where(expenses.c.id == item["expense_id"],
                                          expenses.c.planning_event_id == event.id).values(**values))
        summary = f"changed the cost of hantaran “{item['name']}”"
    log(db, member, event.id, "hantaran.updated", "hantaran", item_id, summary)
    db.commit()
    return get_scoped(db, hantaran_items, event, item_id, "hantaran item")


register_crud(router, "", hantaran_items, "hantaran item", None, HantaranUpdate, with_list=False, label="name")
