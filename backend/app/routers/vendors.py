"""Vendors. A contact (name, phone) is shared by both modes; a booking (status, quote) belongs to one."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.engine import Connection

from app.crud import as_dict, delete_scoped, insert_row, log, update_scoped, update_versioned
from app.db import get_db
from app.deps import Event, Member, get_event, get_member
from app.schemas import BookingUpdate, VendorContactUpdate, VendorCreate, changes
from app.tables import vendor_bookings, vendors

router = APIRouter(tags=["vendors"])


def _bookings(db: Connection, event: Event, booking_id: uuid.UUID | None = None) -> list[dict]:
    stmt = (select(vendor_bookings, vendors.c.name, vendors.c.category, vendors.c.contact,
                   vendors.c.notes.label("vendor_notes"), vendors.c.version.label("vendor_version"))
            .join(vendors, vendors.c.id == vendor_bookings.c.vendor_id)
            .where(vendor_bookings.c.planning_event_id == event.id)
            .order_by(vendors.c.category, vendors.c.name))
    if booking_id is not None:
        stmt = stmt.where(vendor_bookings.c.id == booking_id)
    return [as_dict(r) for r in db.execute(stmt)]


def _booking(db: Connection, event: Event, booking_id: uuid.UUID) -> dict:
    rows = _bookings(db, event, booking_id)
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found.")
    return rows[0]


@router.get("/planning-events/{event_id}/vendors")
def list_vendors(event: Event = Depends(get_event), db: Connection = Depends(get_db)):
    return _bookings(db, event)


@router.post("/planning-events/{event_id}/vendors", status_code=status.HTTP_201_CREATED)
def add_vendor(body: VendorCreate, event: Event = Depends(get_event), member: Member = Depends(get_member),
               db: Connection = Depends(get_db)):
    if body.vendor_id is not None:
        vendor_id = body.vendor_id
        exists = db.scalar(select(func.count()).where(vendors.c.id == vendor_id,
                                                      vendors.c.workspace_id == member.workspace_id))
        if not exists:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor contact not found.")
    elif body.name:
        vendor_id = insert_row(db, vendors, {
            "workspace_id": member.workspace_id, "name": body.name, "category": body.category,
            "contact": body.contact, "notes": body.vendor_notes,
        }, member)["id"]
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the vendor a name, or choose an existing one.")
    booking = insert_row(db, vendor_bookings, {
        "workspace_id": member.workspace_id, "planning_event_id": event.id, "vendor_id": vendor_id,
        "status": body.status, "quote_sen": body.quote_sen, "notes": body.notes,
    }, member)
    result = _booking(db, event, booking["id"])
    log(db, member, event.id, "vendor.created", "vendor_booking", booking["id"], f"added vendor “{result['name']}”")
    db.commit()
    return result


@router.patch("/planning-events/{event_id}/vendors/{booking_id}")
def update_booking(booking_id: uuid.UUID, body: BookingUpdate, event: Event = Depends(get_event),
                   member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    update_scoped(db, vendor_bookings, event, booking_id, body.version, changes(body), member, "vendor")
    result = _booking(db, event, booking_id)
    log(db, member, event.id, "vendor.updated", "vendor_booking", booking_id,
        f"updated vendor “{result['name']}” ({result['status'].lower()})")
    db.commit()
    return result


@router.delete("/planning-events/{event_id}/vendors/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_booking(booking_id: uuid.UUID, event: Event = Depends(get_event), member: Member = Depends(get_member),
                   db: Connection = Depends(get_db)):
    """Removes the vendor from this mode. The contact is deleted too unless the other mode still uses it."""
    name = _booking(db, event, booking_id)["name"]
    row = delete_scoped(db, vendor_bookings, event, booking_id, "vendor")
    still_used = db.scalar(select(func.count()).where(vendor_bookings.c.vendor_id == row["vendor_id"]))
    if not still_used:
        db.execute(delete(vendors).where(vendors.c.id == row["vendor_id"]))
    log(db, member, event.id, "vendor.deleted", "vendor_booking", booking_id, f"removed vendor “{name}”")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/vendor-contacts")
def list_contacts(member: Member = Depends(get_member), db: Connection = Depends(get_db)):
    """All vendor contacts in the workspace, for reusing one in the other mode."""
    rows = db.execute(select(vendors).where(vendors.c.workspace_id == member.workspace_id).order_by(vendors.c.name))
    return [as_dict(r) for r in rows]


@router.patch("/vendor-contacts/{vendor_id}")
def update_contact(vendor_id: uuid.UUID, body: VendorContactUpdate, member: Member = Depends(get_member),
                   db: Connection = Depends(get_db)):
    row = update_versioned(db, vendors, [vendors.c.workspace_id == member.workspace_id], vendor_id, body.version,
                           changes(body), member, "vendor contact")
    log(db, member, None, "vendor_contact.updated", "vendor", vendor_id, f"updated contact details for “{row['name']}”")
    db.commit()
    return row
