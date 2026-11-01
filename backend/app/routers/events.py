"""Planning events (one per mode) and their dashboards."""
from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.engine import Connection

from app.crud import as_dict, insert_row, log, update_versioned
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.schemas import EventCreate, EventUpdate, changes
from app.summaries import MODE_LABEL, budget_summary, calendar_items, next_actions, progress, today
from app.tables import documents, guests, planning_events, vendor_bookings

router = APIRouter(prefix="/planning-events", tags=["planning events"])


def _event_with_figures(db: Connection, row: dict) -> dict:
    return {**row, "progress": progress(db, row["id"]), "budget": budget_summary(db, row["id"])}


@router.get("")
def list_events(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    rows = db.execute(select(planning_events).where(planning_events.c.workspace_id == member.workspace_id)
                      .order_by(planning_events.c.mode))
    return [_event_with_figures(db, as_dict(r)) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_event(body: EventCreate, member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    row = insert_row(db, planning_events, {**body.model_dump(), "workspace_id": member.workspace_id}, member)
    log(db, member, row["id"], "planning_event.created", "planning_event", row["id"],
        f"started planning {MODE_LABEL[row['mode']]}")
    db.commit()
    return row


@router.get("/{event_id}")
def get_planning_event(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    row = as_dict(db.execute(select(planning_events).where(planning_events.c.id == event.id)).one())
    return _event_with_figures(db, row)


@router.patch("/{event_id}")
def update_event(body: EventUpdate, event: Event = Depends(get_event), member: Member = Depends(get_member),
                 db: Connection = Depends(get_db)):
    row = update_versioned(db, planning_events, [planning_events.c.workspace_id == member.workspace_id], event.id,
                           body.version, changes(body), member, "planning event")
    log(db, member, event.id, "planning_event.updated", "planning_event", event.id,
        f"updated {MODE_LABEL[event.mode]} details")
    db.commit()
    return row


@router.get("/{event_id}/dashboard")
def dashboard(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    row = as_dict(db.execute(select(planning_events).where(planning_events.c.id == event.id)).one())
    days = (row["target_date"] - today()).days if row["target_date"] else None
    guest_counts = db.execute(
        select(func.count(),
               func.coalesce(func.sum(guests.c.seats).filter(guests.c.rsvp == "ATTENDING"), 0),
               func.count().filter(guests.c.rsvp == "PENDING"))
        .where(guests.c.planning_event_id == event.id)
    ).one()
    vendors_booked = db.scalar(select(func.count()).where(vendor_bookings.c.planning_event_id == event.id,
                                                          vendor_bookings.c.status.in_(["BOOKED", "COMPLETED"])))
    document_count = db.scalar(select(func.count()).where(documents.c.planning_event_id == event.id))
    return {
        "event": row,
        # None until a date is set; negative once the day has passed (spec test case 8).
        "days_until": days,
        "progress": progress(db, event.id),
        "budget": budget_summary(db, event.id),
        "next_actions": next_actions(db, event.id),
        "upcoming": [i for i in calendar_items(db, event.id) if i["date"] >= today()][:5],
        "guests": {"total": guest_counts[0], "seats_confirmed": int(guest_counts[1]), "rsvp_pending": guest_counts[2]},
        "vendors_booked": vendors_booked,
        "documents": document_count,
    }
