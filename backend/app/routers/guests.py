"""Guest list for one mode (spec 5.5), with an explicit copy from the other mode."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, insert, or_, select
from sqlalchemy.engine import Connection

from app.crud import as_dict, log
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.routers.factory import register_crud
from app.schemas import FamilySide, GuestCreate, GuestUpdate, Rsvp
from app.summaries import MODE_LABEL
from app.tables import guests, planning_events

router = APIRouter(prefix="/planning-events/{event_id}/guests", tags=["guests"])


@router.get("")
def list_guests(event: Event = Depends(get_event), db: Connection = Depends(get_db),
                side: FamilySide | None = None, rsvp: Rsvp | None = None, q: str | None = None):
    stmt = select(guests).where(guests.c.planning_event_id == event.id)
    if side:
        stmt = stmt.where(guests.c.family_side == side)
    if rsvp:
        stmt = stmt.where(guests.c.rsvp == rsvp)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(guests.c.name.ilike(like), guests.c.group_name.ilike(like),
                              guests.c.contact.ilike(like), guests.c.notes.ilike(like)))
    rows = [as_dict(r) for r in db.execute(stmt.order_by(guests.c.group_name, guests.c.name))]
    totals = db.execute(
        select(func.count(), func.count().filter(guests.c.invitation == "INVITED"),
               func.coalesce(func.sum(guests.c.seats).filter(guests.c.rsvp == "ATTENDING"), 0),
               func.count().filter(guests.c.rsvp == "PENDING"))
        .where(guests.c.planning_event_id == event.id)
    ).one()
    return {"guests": rows, "summary": {"total": totals[0], "invited": totals[1],
                                        "seats_confirmed": int(totals[2]), "rsvp_pending": totals[3]}}


register_crud(router, "", guests, "guest", GuestCreate, GuestUpdate, with_list=False, label="name")


@router.post("/copy-from-other-mode")
def copy_from_other_mode(event: Event = Depends(get_event), member: Member = Depends(get_member),
                         db: Connection = Depends(get_db)):
    """Copy the other mode's guests that are not on this list yet (matched by name).
    Copies start as not invited with RSVP pending."""
    source = db.execute(select(planning_events.c.id, planning_events.c.mode).where(
        planning_events.c.workspace_id == event.workspace_id, planning_events.c.mode != event.mode)).first()
    if source is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The other planning mode has not been set up yet.")
    have = {n.strip().lower() for n in db.scalars(select(guests.c.name).where(guests.c.planning_event_id == event.id))}
    to_copy = [g for g in db.execute(select(guests).where(guests.c.planning_event_id == source.id))
               if g.name.strip().lower() not in have]
    if to_copy:
        db.execute(insert(guests), [{
            "planning_event_id": event.id, "name": g.name, "family_side": g.family_side, "group_name": g.group_name,
            "contact": g.contact, "seats": g.seats, "notes": g.notes, "copied_from_guest_id": g.id,
            "invitation": "NOT_INVITED", "rsvp": "PENDING",
            "created_by": member.user_id, "updated_by": member.user_id,
        } for g in to_copy])
        log(db, member, event.id, "guest.copied", "guest", None,
            f"copied {len(to_copy)} guests from {MODE_LABEL[source.mode]}")
    db.commit()
    return {"copied": len(to_copy)}
