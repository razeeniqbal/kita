"""SQLAlchemy Core definitions of the kita schema. The source of truth is
supabase/migrations/; keep these in step with it. The app never creates tables."""
from sqlalchemy import (BigInteger, Boolean, Column, Date, DateTime, FetchedValue, Identity, Integer, MetaData,
                        SmallInteger, Table, Text, Time)
from sqlalchemy.dialects.postgresql import ENUM, UUID

metadata = MetaData(schema="kita")


def _enum(name: str, *values: str) -> ENUM:
    return ENUM(*values, name=name, schema="kita", create_type=False)


planning_mode = _enum("planning_mode", "TUNANG", "PERKAHWINAN")
event_status = _enum("event_status", "PLANNING", "CONFIRMED", "COMPLETED")
member_role = _enum("member_role", "OWNER", "EDITOR")
task_status = _enum("task_status", "NOT_STARTED", "IN_PROGRESS", "DONE", "POSTPONED")
task_priority = _enum("task_priority", "LOW", "NORMAL", "HIGH")
assignee = _enum("assignee", "PARTNER_1", "PARTNER_2", "BOTH", "UNASSIGNED")
family_side = _enum("family_side", "PARTNER_1", "PARTNER_2", "BOTH")
payer = _enum("payer", "PARTNER_1", "PARTNER_2", "BOTH", "OTHER")
vendor_status = _enum("vendor_status", "CONSIDERING", "SHORTLISTED", "BOOKED", "COMPLETED", "CANCELLED")
invitation_status = _enum("invitation_status", "NOT_INVITED", "INVITED")
rsvp_status = _enum("rsvp_status", "PENDING", "ATTENDING", "DECLINED")
calendar_type = _enum("calendar_type", "APPOINTMENT", "VENUE_VISIT", "FAMILY_DISCUSSION", "FITTING", "PAYMENT", "OTHER")
document_kind = _enum("document_kind", "QUOTATION", "RECEIPT", "AGREEMENT", "PAPERWORK", "OTHER")
hantaran_status = _enum("hantaran_status", "PLANNED", "BUYING", "BOUGHT", "DECORATED", "READY")


def _id() -> Column:
    # The database generates ids (gen_random_uuid()).
    return Column("id", UUID(as_uuid=True), primary_key=True, server_default=FetchedValue())


def _stamps(authored: bool = True) -> list[Column]:
    cols = [Column("created_at", DateTime(timezone=True)), Column("updated_at", DateTime(timezone=True)),
            Column("version", Integer)]
    if authored:
        cols += [Column("created_by", UUID(as_uuid=True)), Column("updated_by", UUID(as_uuid=True))]
    return cols


def _event_id() -> Column:
    return Column("planning_event_id", UUID(as_uuid=True), nullable=False)


workspaces = Table(
    "workspaces", metadata, _id(),
    Column("name", Text), Column("partner_1_name", Text), Column("partner_2_name", Text),
    *_stamps(authored=False),
)

workspace_members = Table(
    "workspace_members", metadata,
    Column("workspace_id", UUID(as_uuid=True), primary_key=True),
    Column("user_id", UUID(as_uuid=True), primary_key=True),
    Column("partner_slot", SmallInteger), Column("role", member_role),
    *_stamps(authored=False),
)

planning_events = Table(
    "planning_events", metadata, _id(),
    Column("workspace_id", UUID(as_uuid=True)), Column("mode", planning_mode),
    Column("event_name", Text), Column("target_date", Date), Column("status", event_status),
    Column("target_budget_sen", BigInteger), Column("venue", Text), Column("start_time", Time), Column("rsvp_by", Date),
    Column("invite_hosts", Text), Column("programme", Text), Column("contacts", Text), Column("invite_token", Text),
    *_stamps(),
)

budget_categories = Table(
    "budget_categories", metadata, _id(), _event_id(),
    Column("name", Text), Column("sort_order", Integer),
    *_stamps(authored=False),
)

vendors = Table(
    "vendors", metadata, _id(),
    Column("workspace_id", UUID(as_uuid=True)), Column("name", Text), Column("category", Text),
    Column("contact", Text), Column("notes", Text),
    *_stamps(),
)

vendor_bookings = Table(
    "vendor_bookings", metadata, _id(), _event_id(),
    Column("workspace_id", UUID(as_uuid=True)), Column("vendor_id", UUID(as_uuid=True)),
    Column("status", vendor_status), Column("quote_sen", BigInteger), Column("notes", Text),
    *_stamps(),
)

expenses = Table(
    "expenses", metadata, _id(), _event_id(),
    Column("category_id", UUID(as_uuid=True)), Column("vendor_booking_id", UUID(as_uuid=True)),
    Column("name", Text), Column("planned_sen", BigInteger), Column("quoted_sen", BigInteger),
    Column("committed_sen", BigInteger), Column("balance_due_date", Date),
    Column("allow_overpayment", Boolean), Column("notes", Text),
    *_stamps(),
)

payments = Table(
    "payments", metadata, _id(),
    Column("expense_id", UUID(as_uuid=True)), Column("amount_sen", BigInteger), Column("paid_on", Date),
    Column("paid_by", payer), Column("reference", Text),
    *_stamps(),
)

tasks = Table(
    "tasks", metadata, _id(), _event_id(),
    Column("title", Text), Column("description", Text), Column("category", Text),
    Column("status", task_status), Column("priority", task_priority), Column("due_date", Date),
    Column("assignee", assignee), Column("expense_id", UUID(as_uuid=True)), Column("sort_order", Integer),
    Column("completed_at", DateTime(timezone=True)), Column("moved_from_event_id", UUID(as_uuid=True)),
    *_stamps(),
)

calendar_events = Table(
    "calendar_events", metadata, _id(), _event_id(),
    Column("title", Text), Column("event_date", Date), Column("start_time", Time),
    Column("location", Text), Column("type", calendar_type), Column("notes", Text),
    *_stamps(),
)

guests = Table(
    "guests", metadata, _id(), _event_id(),
    Column("name", Text), Column("family_side", family_side), Column("group_name", Text),
    Column("contact", Text), Column("invitation", invitation_status), Column("rsvp", rsvp_status),
    Column("seats", SmallInteger), Column("notes", Text), Column("copied_from_guest_id", UUID(as_uuid=True)),
    Column("rsvp_token", Text), Column("rsvp_note", Text), Column("responded_at", DateTime(timezone=True)),
    *_stamps(),
)

notes = Table(
    "notes", metadata, _id(), _event_id(),
    Column("title", Text), Column("body", Text), Column("link", Text), Column("pinned", Boolean),
    *_stamps(),
)

documents = Table(
    "documents", metadata, _id(), _event_id(),
    Column("name", Text), Column("kind", document_kind), Column("storage_path", Text),
    Column("content_type", Text), Column("size_bytes", BigInteger),
    *_stamps(),
)

hantaran_items = Table(
    "hantaran_items", metadata, _id(), _event_id(),
    Column("name", Text), Column("giver", family_side), Column("tray_number", SmallInteger),
    Column("status", hantaran_status), Column("assignee", assignee),
    Column("expense_id", UUID(as_uuid=True)), Column("task_id", UUID(as_uuid=True)),
    Column("notes", Text), Column("sort_order", Integer),
    *_stamps(),
)

activity_log = Table(
    "activity_log", metadata,
    Column("id", BigInteger, Identity(), primary_key=True),
    Column("workspace_id", UUID(as_uuid=True)), Column("planning_event_id", UUID(as_uuid=True)),
    Column("actor_user_id", UUID(as_uuid=True)), Column("action", Text), Column("entity_type", Text),
    Column("entity_id", UUID(as_uuid=True)), Column("summary", Text),
    Column("created_at", DateTime(timezone=True)),
)

push_subscriptions = Table(
    "push_subscriptions", metadata, _id(),
    Column("workspace_id", UUID(as_uuid=True)), Column("user_id", UUID(as_uuid=True)),
    Column("endpoint", Text), Column("p256dh", Text), Column("auth", Text),
    Column("partner_updates", Boolean), Column("daily_digest", Boolean),
    Column("created_at", DateTime(timezone=True)), Column("last_sent_at", DateTime(timezone=True)),
)

widget_keys = Table(
    "widget_keys", metadata,
    Column("user_id", UUID(as_uuid=True), primary_key=True), Column("workspace_id", UUID(as_uuid=True)),
    Column("key", Text), Column("key_hash", Text), Column("created_at", DateTime(timezone=True)),
    Column("last_used_at", DateTime(timezone=True)),
)
