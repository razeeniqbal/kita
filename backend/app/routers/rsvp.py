"""Public invitation pages, no sign-in. Two kinds of link, both made in guests.py:

- a guest's private link (/rsvp/<token>): their own invitation, which they answer;
- the event's shared link (/invite/<token>), for groups: guests type their name, phone and headcount,
  and are added to the guest list with a private link of their own for changing their answer later.

Neither reaches anything else in the workspace."""
import datetime as dt
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field, StringConstraints
from sqlalchemy import func, insert, select, update
from sqlalchemy.engine import Connection

from app import push
from app.db import get_db
from app.schemas import Body, RsvpAnswer
from app.summaries import MODE_LABEL, today
from app.tables import activity_log, guests, planning_events, workspaces

router = APIRouter(tags=["rsvp"])

SHARED_GROUP = "Shared invitation link"
SHARED_LIMIT = 1000   # guests one shared link may add; stops a leaked link filling the list


class SharedAnswer(Body):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    phone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=6, max_length=40)]
    rsvp: Literal["ATTENDING", "DECLINED"]
    seats: Annotated[int, Field(ge=1, le=20)] = 1
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


EVENT_COLUMNS = (planning_events.c.id.label("event_id"), planning_events.c.mode, planning_events.c.event_name,
                 planning_events.c.target_date, planning_events.c.start_time, planning_events.c.venue,
                 planning_events.c.rsvp_by, planning_events.c.invite_hosts, planning_events.c.programme,
                 workspaces.c.id.label("workspace_id"), workspaces.c.partner_1_name, workspaces.c.partner_2_name)


def _valid(token: str) -> bool:
    return 20 <= len(token) <= 64


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "This invitation link isn't valid any more. Ask the couple for a new one.")


def _guest_invitation(db: Connection, token: str):
    row = db.execute(
        select(guests.c.id, guests.c.name, guests.c.seats, guests.c.rsvp, guests.c.rsvp_note, *EVENT_COLUMNS)
        .join(planning_events, planning_events.c.id == guests.c.planning_event_id)
        .join(workspaces, workspaces.c.id == planning_events.c.workspace_id)
        .where(guests.c.rsvp_token == token)).first() if _valid(token) else None
    if row is None:
        raise _not_found()
    return row


def _shared_invitation(db: Connection, token: str):
    row = db.execute(select(*EVENT_COLUMNS).join(workspaces, workspaces.c.id == planning_events.c.workspace_id)
                     .where(planning_events.c.invite_token == token)).first() if _valid(token) else None
    if row is None:
        raise _not_found()
    return row


def _closed(row) -> bool:
    return row.rsvp_by is not None and row.rsvp_by < today()


def _page(row, guest: dict | None) -> dict:
    # The bride's name first, as Malay invitations put it (partner 2 is Sabrina).
    partners = [row.partner_2_name or "Sabrina", row.partner_1_name or "Razeen"]
    return {
        "couple": " & ".join(partners), "partners": partners,
        "event": {"mode": row.mode, "label": MODE_LABEL[row.mode], "name": row.event_name, "date": row.target_date,
                  "start_time": row.start_time, "venue": row.venue, "rsvp_by": row.rsvp_by,
                  "hosts": row.invite_hosts, "programme": row.programme},
        "closed": _closed(row),
        "guest": guest,
    }


def _record(db: Connection, row, guest_id, summary: str) -> None:
    """Note the reply in the activity log and tell both partners."""
    db.execute(insert(activity_log).values(workspace_id=row.workspace_id, planning_event_id=row.event_id,
                                           actor_user_id=None, action="guest.rsvp", entity_type="guest",
                                           entity_id=guest_id, summary=summary))
    push.queue(db, push.Change(row.workspace_id, None, 0, row.event_id, "guest.rsvp", "guest", summary))


def _summary(name: str, attending: bool, seats: int) -> str:
    return (f"replied for “{name}”: attending, {seats} {'seat' if seats == 1 else 'seats'}"
            if attending else f"replied for “{name}”: can't attend")


@router.get("/rsvp/{token}")
def read_invitation(token: str, db: Connection = Depends(get_db)):
    row = _guest_invitation(db, token)
    return _page(row, {"name": row.name, "seats": row.seats, "rsvp": row.rsvp, "note": row.rsvp_note})


@router.post("/rsvp/{token}")
def answer_invitation(token: str, body: RsvpAnswer, db: Connection = Depends(get_db)):
    row = _guest_invitation(db, token)
    if _closed(row):
        raise HTTPException(status.HTTP_409_CONFLICT, "RSVP has closed for this invitation.")
    attending = body.rsvp == "ATTENDING"
    if attending and body.seats > row.seats:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"This invitation is for up to {row.seats} {'person' if row.seats == 1 else 'people'}.")
    # A smaller party lowers the seat count; the couple can raise it again in Guests.
    db.execute(update(guests).where(guests.c.id == row.id).values(
        rsvp=body.rsvp, seats=body.seats if attending else row.seats, rsvp_note=body.note,
        responded_at=dt.datetime.now(dt.UTC)))
    _record(db, row, row.id, _summary(row.name, attending, body.seats))
    db.commit()
    return read_invitation(token, db)


@router.get("/invite/{token}")
def read_shared_invitation(token: str, db: Connection = Depends(get_db)):
    return _page(_shared_invitation(db, token), None)


@router.post("/invite/{token}")
def answer_shared_invitation(token: str, body: SharedAnswer, db: Connection = Depends(get_db)):
    """Add the guest to the list with their answer, and hand back their own private link."""
    row = _shared_invitation(db, token)
    if _closed(row):
        raise HTTPException(status.HTTP_409_CONFLICT, "RSVP has closed for this invitation.")
    added = db.scalar(select(func.count()).where(guests.c.planning_event_id == row.event_id,
                                                 guests.c.group_name == SHARED_GROUP))
    if added >= SHARED_LIMIT:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invitation can't take more replies. Please contact the couple.")
    own = secrets.token_urlsafe(24)
    guest_id = db.execute(insert(guests).values(
        planning_event_id=row.event_id, name=body.name, contact=body.phone, group_name=SHARED_GROUP,
        family_side="BOTH", seats=body.seats, invitation="INVITED", rsvp=body.rsvp, rsvp_note=body.note,
        rsvp_token=own, responded_at=dt.datetime.now(dt.UTC),
    ).returning(guests.c.id)).scalar_one()
    _record(db, row, guest_id, _summary(body.name, body.rsvp == "ATTENDING", body.seats))
    db.commit()
    return {"token": own}
