"""Request bodies. Field names match the database columns. Money is integer sen.
Update bodies carry the `version` the client last saw; omitted fields are left unchanged."""
import datetime as dt
import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

EventStatus = Literal["PLANNING", "CONFIRMED", "COMPLETED"]
TaskStatus = Literal["NOT_STARTED", "IN_PROGRESS", "DONE", "POSTPONED"]
Priority = Literal["LOW", "NORMAL", "HIGH"]
Assignee = Literal["PARTNER_1", "PARTNER_2", "BOTH", "UNASSIGNED"]
FamilySide = Literal["PARTNER_1", "PARTNER_2", "BOTH"]
Payer = Literal["PARTNER_1", "PARTNER_2", "BOTH", "OTHER"]
VendorStatus = Literal["CONSIDERING", "SHORTLISTED", "BOOKED", "COMPLETED", "CANCELLED"]
Invitation = Literal["NOT_INVITED", "INVITED"]
Rsvp = Literal["PENDING", "ATTENDING", "DECLINED"]
CalendarType = Literal["APPOINTMENT", "VENUE_VISIT", "FAMILY_DISCUSSION", "FITTING", "PAYMENT", "OTHER"]
DocumentKind = Literal["QUOTATION", "RECEIPT", "AGREEMENT", "PAPERWORK", "OTHER"]


def Name(max_length: int):  # noqa: N802 - reads like a type
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]


Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Sen = Annotated[int, Field(ge=0, le=10_000_000_000_00)]   # up to RM 10 billion
Version = Annotated[int, Field(ge=1)]


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


# Workspace and planning events ------------------------------------------------------------------

class WorkspaceUpdate(Body):
    version: Version
    name: Name(120) | None = None
    partner_1_name: Name(60) | None = None
    partner_2_name: Name(60) | None = None


class EventCreate(Body):
    mode: Literal["TUNANG", "PERKAHWINAN"]
    event_name: Name(120)
    target_date: dt.date | None = None
    status: EventStatus = "PLANNING"
    target_budget_sen: Sen = 0


class EventUpdate(Body):
    version: Version
    event_name: Name(120) | None = None
    target_date: dt.date | None = None
    status: EventStatus | None = None
    target_budget_sen: Sen | None = None


# Checklist --------------------------------------------------------------------------------------

class TaskCreate(Body):
    title: Name(300)
    description: Text = ""
    category: Name(80) = "Lain-lain"
    status: TaskStatus = "NOT_STARTED"
    priority: Priority = "NORMAL"
    due_date: dt.date | None = None
    assignee: Assignee = "UNASSIGNED"
    expense_id: uuid.UUID | None = None
    sort_order: int = 0


class TaskUpdate(Body):
    version: Version
    title: Name(300) | None = None
    description: Text | None = None
    category: Name(80) | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    due_date: dt.date | None = None
    assignee: Assignee | None = None
    expense_id: uuid.UUID | None = None
    sort_order: int | None = None


class VersionOnly(Body):
    version: Version


# Budget -----------------------------------------------------------------------------------------

class CategoryCreate(Body):
    name: Name(80)
    sort_order: int = 0


class CategoryUpdate(Body):
    version: Version
    name: Name(80) | None = None
    sort_order: int | None = None


class ExpenseCreate(Body):
    name: Name(160)
    category_id: uuid.UUID | None = None
    vendor_booking_id: uuid.UUID | None = None
    planned_sen: Sen = 0
    quoted_sen: Sen = 0
    committed_sen: Sen = 0
    balance_due_date: dt.date | None = None
    allow_overpayment: bool = False
    notes: Text = ""


class ExpenseUpdate(Body):
    version: Version
    name: Name(160) | None = None
    category_id: uuid.UUID | None = None
    vendor_booking_id: uuid.UUID | None = None
    planned_sen: Sen | None = None
    quoted_sen: Sen | None = None
    committed_sen: Sen | None = None
    balance_due_date: dt.date | None = None
    allow_overpayment: bool | None = None
    notes: Text | None = None


class PaymentCreate(Body):
    amount_sen: Annotated[int, Field(gt=0, le=10_000_000_000_00)]
    paid_on: dt.date
    paid_by: Payer
    reference: Short = ""


# Vendors ----------------------------------------------------------------------------------------

class VendorCreate(Body):
    """Book a vendor for this mode. Pass vendor_id to reuse a contact from the other mode,
    or name (and the other contact fields) to create a new one."""
    vendor_id: uuid.UUID | None = None
    name: Name(160) | None = None
    category: Name(80) = "Other"
    contact: Short = ""
    vendor_notes: Text = ""
    status: VendorStatus = "CONSIDERING"
    quote_sen: Sen = 0
    notes: Text = ""


class BookingUpdate(Body):
    version: Version
    status: VendorStatus | None = None
    quote_sen: Sen | None = None
    notes: Text | None = None


class VendorContactUpdate(Body):
    version: Version
    name: Name(160) | None = None
    category: Name(80) | None = None
    contact: Short | None = None
    notes: Text | None = None


# Calendar, guests, notes, documents --------------------------------------------------------------

class CalendarCreate(Body):
    title: Name(200)
    event_date: dt.date
    start_time: dt.time | None = None
    location: Short = ""
    type: CalendarType = "APPOINTMENT"
    notes: Text = ""


class CalendarUpdate(Body):
    version: Version
    title: Name(200) | None = None
    event_date: dt.date | None = None
    start_time: dt.time | None = None
    location: Short | None = None
    type: CalendarType | None = None
    notes: Text | None = None


class GuestCreate(Body):
    name: Name(160)
    family_side: FamilySide = "BOTH"
    group_name: Short = ""
    contact: Short = ""
    invitation: Invitation = "NOT_INVITED"
    rsvp: Rsvp = "PENDING"
    seats: Annotated[int, Field(ge=1, le=50)] = 1
    notes: Text = ""


class GuestUpdate(Body):
    version: Version
    name: Name(160) | None = None
    family_side: FamilySide | None = None
    group_name: Short | None = None
    contact: Short | None = None
    invitation: Invitation | None = None
    rsvp: Rsvp | None = None
    seats: Annotated[int, Field(ge=1, le=50)] | None = None
    notes: Text | None = None


class NoteCreate(Body):
    title: Name(200)
    body: Text = ""
    link: Short = ""
    pinned: bool = False


class NoteUpdate(Body):
    version: Version
    title: Name(200) | None = None
    body: Text | None = None
    link: Short | None = None
    pinned: bool | None = None


HantaranStatus = Literal["PLANNED", "BUYING", "BOUGHT", "DECORATED", "READY"]
Giver = Literal["PARTNER_1", "PARTNER_2"]
TrayNumber = Annotated[int, Field(ge=1, le=99)]


class HantaranCreate(Body):
    name: Name(160)
    giver: Giver = "PARTNER_1"
    tray_number: TrayNumber | None = None
    status: HantaranStatus = "PLANNED"
    assignee: Assignee = "UNASSIGNED"
    expense_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    notes: Text = ""
    sort_order: int = 0
    # Convenience: also create a budget line in the Hantaran category and link it.
    create_expense: bool = False
    planned_sen: Sen = 0


class HantaranUpdate(Body):
    version: Version
    name: Name(160) | None = None
    giver: Giver | None = None
    tray_number: TrayNumber | None = None
    status: HantaranStatus | None = None
    assignee: Assignee | None = None
    expense_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    notes: Text | None = None
    sort_order: int | None = None


class DocumentUpdate(Body):
    version: Version
    name: Name(200) | None = None
    kind: DocumentKind | None = None


# Push notifications --------------------------------------------------------------------------------

class PushKeys(Body):
    p256dh: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    auth: Annotated[str, StringConstraints(min_length=1, max_length=100)]


class PushSubscription(Body):
    """The browser's PushSubscription.toJSON(), plus this device's choices when they change."""
    endpoint: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    keys: PushKeys
    expirationTime: int | None = None   # noqa: N815 - the browser's own field name
    partner_updates: bool | None = None
    daily_digest: bool | None = None


class PushEndpoint(Body):
    endpoint: Annotated[str, StringConstraints(min_length=1, max_length=1000)]


def changes(body: BaseModel) -> dict:
    """Fields the client actually sent, without the version."""
    return body.model_dump(exclude_unset=True, exclude={"version"})
