"""Budget for one mode: categories, expenses and their payments (spec 5.3)."""
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select
from sqlalchemy.engine import Connection

from app.crud import as_dict, delete_scoped, get_scoped, insert_row, log, not_found, update_scoped
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.routers.factory import register_crud
from app.schemas import CategoryCreate, CategoryUpdate, ExpenseCreate, ExpenseUpdate, PaymentCreate, changes
from app.summaries import budget_summary
from app.tables import budget_categories, expenses, payments

router = APIRouter(prefix="/planning-events/{event_id}", tags=["budget"])


@router.get("/budget/summary")
def summary(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    return budget_summary(db, event.id)


register_crud(router, "/budget-categories", budget_categories, "budget category", CategoryCreate, CategoryUpdate,
              order_by=(budget_categories.c.sort_order, budget_categories.c.name), label="name")


def _with_payments(db: Connection, expense_rows: list[dict]) -> list[dict]:
    """Attach payments plus paid and balance figures to each expense."""
    ids = [e["id"] for e in expense_rows]
    by_expense: dict[uuid.UUID, list[dict]] = {i: [] for i in ids}
    if ids:
        for p in db.execute(select(payments).where(payments.c.expense_id.in_(ids))
                            .order_by(payments.c.paid_on, payments.c.created_at)):
            by_expense[p.expense_id].append(as_dict(p))
    out = []
    for e in expense_rows:
        paid = sum(p["amount_sen"] for p in by_expense[e["id"]])
        balance = max(e["committed_sen"] - paid, 0) if e["committed_sen"] else 0
        out.append({**e, "payments": by_expense[e["id"]], "paid_sen": paid, "balance_sen": balance})
    return out


def _one(db: Connection, event: Event, expense_id: uuid.UUID) -> dict:
    return _with_payments(db, [get_scoped(db, expenses, event, expense_id, "expense")])[0]


@router.get("/expenses")
def list_expenses(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    rows = db.execute(select(expenses).where(expenses.c.planning_event_id == event.id).order_by(expenses.c.name))
    return _with_payments(db, [as_dict(r) for r in rows])


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
def create_expense(body: ExpenseCreate, event: Event = Depends(get_event), member: Member = Depends(get_member),
                   db: Connection = Depends(get_db)):
    row = insert_row(db, expenses, {**body.model_dump(), "planning_event_id": event.id}, member)
    log(db, member, event.id, "expense.created", "expense", row["id"], f"added expense “{row['name']}”")
    db.commit()
    return _with_payments(db, [row])[0]


@router.get("/expenses/{expense_id}")
def get_expense(expense_id: uuid.UUID, event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    return _one(db, event, expense_id)


@router.patch("/expenses/{expense_id}")
def update_expense(expense_id: uuid.UUID, body: ExpenseUpdate, event: Event = Depends(get_event),
                   member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    row = update_scoped(db, expenses, event, expense_id, body.version, changes(body), member, "expense")
    log(db, member, event.id, "expense.updated", "expense", row["id"], f"updated expense “{row['name']}”")
    db.commit()
    return _one(db, event, expense_id)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: uuid.UUID, event: Event = Depends(get_event), member: Member = Depends(get_member),
                   db: Connection = Depends(get_db)):
    row = delete_scoped(db, expenses, event, expense_id, "expense")
    log(db, member, event.id, "expense.deleted", "expense", row["id"], f"deleted expense “{row['name']}”")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/expenses/{expense_id}/payments", status_code=status.HTTP_201_CREATED)
def add_payment(expense_id: uuid.UUID, body: PaymentCreate, event: Event = Depends(get_event),
                member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """The database refuses payments beyond the committed amount unless allow_overpayment is on."""
    expense = get_scoped(db, expenses, event, expense_id, "expense")
    insert_row(db, payments, {**body.model_dump(), "expense_id": expense_id}, member)
    log(db, member, event.id, "payment.created", "expense", expense_id,
        f"recorded a payment of RM {body.amount_sen / 100:,.2f} for “{expense['name']}”")
    db.commit()
    return _one(db, event, expense_id)


@router.delete("/expenses/{expense_id}/payments/{payment_id}")
def delete_payment(expense_id: uuid.UUID, payment_id: uuid.UUID, event: Event = Depends(get_event),
                   member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    expense = get_scoped(db, expenses, event, expense_id, "expense")
    removed = db.execute(delete(payments).where(payments.c.id == payment_id, payments.c.expense_id == expense_id)
                         .returning(payments.c.amount_sen)).first()
    if removed is None:
        raise not_found("payment")
    log(db, member, event.id, "payment.deleted", "expense", expense_id,
        f"removed a payment of RM {removed.amount_sen / 100:,.2f} from “{expense['name']}”")
    db.commit()
    return _one(db, event, expense_id)
