-- kita. initial schema (spec v1.2, section 9)
--
-- Access model
--   Everything lives in the private "kita" schema, which Supabase's Data API does not expose.
--   The FastAPI backend is the only client. It connects with a privileged database role and must
--   check workspace membership and mode on every request (spec section 8).
--   Row level security is enabled with no policies, and the anon/authenticated API roles get no
--   grants, so these tables stay unreadable through Supabase's API even if the schema is exposed later.
--
-- Mode isolation
--   Every mode-scoped row hangs off one planning_event (TUNANG or PERKAHWINAN). Links between rows
--   (task -> expense, expense -> category or vendor booking) use composite foreign keys that include
--   planning_event_id, so the database itself refuses a link that crosses modes.
--
-- Money is stored as integer sen (bigint). Every editable row carries a version number that a trigger
-- bumps on each update; the API updates with "where id = ? and version = ?" to detect concurrent edits.

create schema if not exists kita;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type kita.planning_mode     as enum ('TUNANG', 'PERKAHWINAN');
create type kita.event_status      as enum ('PLANNING', 'CONFIRMED', 'COMPLETED');
create type kita.member_role       as enum ('OWNER', 'EDITOR');
create type kita.task_status       as enum ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'POSTPONED');
create type kita.task_priority     as enum ('LOW', 'NORMAL', 'HIGH');
-- People are referred to by partner slot; workspaces.partner_1_name / partner_2_name hold the names
-- and workspace_members.partner_slot links each slot to a login.
create type kita.assignee          as enum ('PARTNER_1', 'PARTNER_2', 'BOTH', 'UNASSIGNED');
create type kita.family_side       as enum ('PARTNER_1', 'PARTNER_2', 'BOTH');
create type kita.payer             as enum ('PARTNER_1', 'PARTNER_2', 'BOTH', 'OTHER');
create type kita.vendor_status     as enum ('CONSIDERING', 'SHORTLISTED', 'BOOKED', 'COMPLETED', 'CANCELLED');
create type kita.invitation_status as enum ('NOT_INVITED', 'INVITED');
create type kita.rsvp_status       as enum ('PENDING', 'ATTENDING', 'DECLINED');
create type kita.calendar_type     as enum ('APPOINTMENT', 'VENUE_VISIT', 'FAMILY_DISCUSSION', 'FITTING', 'PAYMENT', 'OTHER');
create type kita.document_kind     as enum ('QUOTATION', 'RECEIPT', 'AGREEMENT', 'PAPERWORK', 'OTHER');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at and version current on every update.
-- ---------------------------------------------------------------------------
create function kita.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Workspace and members
-- ---------------------------------------------------------------------------
create table kita.workspaces (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 120),
  partner_1_name text not null check (length(trim(partner_1_name)) between 1 and 60),
  partner_2_name text not null check (length(trim(partner_2_name)) between 1 and 60),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1
);

create table kita.workspace_members (
  workspace_id uuid not null references kita.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  partner_slot smallint not null check (partner_slot in (1, 2)),
  role         kita.member_role not null default 'EDITOR',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  primary key (workspace_id, user_id),
  unique (workspace_id, partner_slot)
);
create index workspace_members_user_idx on kita.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Planning events: exactly one per mode per workspace for the MVP.
-- ---------------------------------------------------------------------------
create table kita.planning_events (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references kita.workspaces (id) on delete cascade,
  mode              kita.planning_mode not null,
  event_name        text not null check (length(trim(event_name)) between 1 and 120),
  target_date       date,
  status            kita.event_status not null default 'PLANNING',
  target_budget_sen bigint not null default 0 check (target_budget_sen >= 0),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1,
  unique (workspace_id, mode),
  unique (workspace_id, id)   -- target for composite foreign keys
);

-- ---------------------------------------------------------------------------
-- Budget
-- ---------------------------------------------------------------------------
create table kita.budget_categories (
  id                uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references kita.planning_events (id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 80),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer not null default 1,
  unique (planning_event_id, name),
  unique (planning_event_id, id)
);

-- Vendor contacts are shared across both modes; bookings (status, quote) belong to one mode.
create table kita.vendors (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kita.workspaces (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 160),
  category     text not null default 'Other',
  contact      text not null default '',
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  version      integer not null default 1,
  unique (workspace_id, id)
);

create table kita.vendor_bookings (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null,
  planning_event_id uuid not null,
  vendor_id         uuid not null,
  status            kita.vendor_status not null default 'CONSIDERING',
  quote_sen         bigint not null default 0 check (quote_sen >= 0),
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1,
  foreign key (workspace_id, planning_event_id) references kita.planning_events (workspace_id, id) on delete cascade,
  foreign key (workspace_id, vendor_id) references kita.vendors (workspace_id, id) on delete cascade,
  unique (planning_event_id, vendor_id),
  unique (planning_event_id, id)
);

create table kita.expenses (
  id                uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references kita.planning_events (id) on delete cascade,
  category_id       uuid,
  vendor_booking_id uuid,
  name              text not null check (length(trim(name)) between 1 and 160),
  planned_sen       bigint not null default 0 check (planned_sen >= 0),
  quoted_sen        bigint not null default 0 check (quoted_sen >= 0),
  committed_sen     bigint not null default 0 check (committed_sen >= 0),
  balance_due_date  date,
  allow_overpayment boolean not null default false,
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1,
  foreign key (planning_event_id, category_id)
    references kita.budget_categories (planning_event_id, id) on delete set null (category_id),
  foreign key (planning_event_id, vendor_booking_id)
    references kita.vendor_bookings (planning_event_id, id) on delete set null (vendor_booking_id),
  unique (planning_event_id, id)
);

-- Deposits, instalments and final payments for one expense.
create table kita.payments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references kita.expenses (id) on delete cascade,
  amount_sen bigint not null check (amount_sen > 0),
  paid_on    date not null,
  paid_by    kita.payer not null,
  reference  text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  version    integer not null default 1
);
create index payments_expense_idx on kita.payments (expense_id);

-- ---------------------------------------------------------------------------
-- Checklist
-- ---------------------------------------------------------------------------
create table kita.tasks (
  id                  uuid primary key default gen_random_uuid(),
  planning_event_id   uuid not null references kita.planning_events (id) on delete cascade,
  title               text not null check (length(trim(title)) between 1 and 300),
  description         text not null default '',
  category            text not null default 'Lain-lain',
  status              kita.task_status not null default 'NOT_STARTED',
  priority            kita.task_priority not null default 'NORMAL',
  due_date            date,
  assignee            kita.assignee not null default 'UNASSIGNED',
  expense_id          uuid,
  sort_order          integer not null default 0,
  completed_at        timestamptz,
  moved_from_event_id uuid references kita.planning_events (id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,
  version             integer not null default 1,
  -- A task can only link to a cost in its own mode. Moving a task to the other mode means
  -- clearing expense_id first; the database rejects the move otherwise.
  foreign key (planning_event_id, expense_id)
    references kita.expenses (planning_event_id, id) on delete set null (expense_id)
);
create index tasks_event_idx on kita.tasks (planning_event_id, status, due_date);

-- ---------------------------------------------------------------------------
-- Calendar, guests, notes, documents
-- ---------------------------------------------------------------------------
create table kita.calendar_events (
  id                uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references kita.planning_events (id) on delete cascade,
  title             text not null check (length(trim(title)) between 1 and 200),
  event_date        date not null,
  start_time        time,
  location          text not null default '',
  type              kita.calendar_type not null default 'APPOINTMENT',
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1
);
create index calendar_events_event_idx on kita.calendar_events (planning_event_id, event_date);

create table kita.guests (
  id                   uuid primary key default gen_random_uuid(),
  planning_event_id    uuid not null references kita.planning_events (id) on delete cascade,
  name                 text not null check (length(trim(name)) between 1 and 160),
  family_side          kita.family_side not null default 'BOTH',
  group_name           text not null default '',
  contact              text not null default '',
  invitation           kita.invitation_status not null default 'NOT_INVITED',
  rsvp                 kita.rsvp_status not null default 'PENDING',
  seats                smallint not null default 1 check (seats between 1 and 50),
  notes                text not null default '',
  copied_from_guest_id uuid references kita.guests (id) on delete set null,
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null,
  version              integer not null default 1
);
create index guests_event_idx on kita.guests (planning_event_id);

create table kita.notes (
  id                uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references kita.planning_events (id) on delete cascade,
  title             text not null check (length(trim(title)) between 1 and 200),
  body              text not null default '',
  link              text not null default '',
  pinned            boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1
);
create index notes_event_idx on kita.notes (planning_event_id);

-- Files live in a private Supabase Storage bucket; this table holds their metadata.
create table kita.documents (
  id                uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references kita.planning_events (id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 200),
  kind              kita.document_kind not null default 'OTHER',
  storage_path      text not null unique,
  content_type      text not null,
  size_bytes        bigint not null check (size_bytes between 1 and 15728640),  -- 15 MB
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1
);
create index documents_event_idx on kita.documents (planning_event_id);

-- ---------------------------------------------------------------------------
-- Activity log: append-only record of who changed what.
-- ---------------------------------------------------------------------------
create table kita.activity_log (
  id                bigint generated always as identity primary key,
  workspace_id      uuid not null references kita.workspaces (id) on delete cascade,
  planning_event_id uuid references kita.planning_events (id) on delete set null,
  actor_user_id     uuid references auth.users (id) on delete set null,
  action            text not null,          -- e.g. 'task.updated', 'payment.created', 'task.moved'
  entity_type       text not null,
  entity_id         uuid,
  summary           text not null default '',
  created_at        timestamptz not null default now()
);
create index activity_log_workspace_idx on kita.activity_log (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rules enforced by the database
-- ---------------------------------------------------------------------------

-- completed_at follows status, so the API never has to keep them in step.
create function kita.tasks_set_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'DONE' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger set_completed_at before insert or update of status on kita.tasks
  for each row execute function kita.tasks_set_completed_at();

-- Payments may not add up to more than the committed amount unless the expense allows it
-- (spec 5.3). With no commitment recorded yet (committed_sen = 0) payments are not limited.
create function kita.assert_payments_within_commitment(p_expense_id uuid) returns void
language plpgsql as $$
declare
  v_committed bigint;
  v_allow     boolean;
  v_paid      bigint;
begin
  select committed_sen, allow_overpayment into v_committed, v_allow
  from kita.expenses where id = p_expense_id;
  if not found or v_allow or v_committed = 0 then
    return;
  end if;
  select coalesce(sum(amount_sen), 0) into v_paid from kita.payments where expense_id = p_expense_id;
  if v_paid > v_committed then
    raise exception 'Payments of % sen exceed the committed % sen for expense %', v_paid, v_committed, p_expense_id
      using errcode = 'check_violation',
            hint = 'Correct the amounts or set allow_overpayment on the expense.';
  end if;
end $$;

create function kita.payments_check() returns trigger
language plpgsql as $$
begin
  perform kita.assert_payments_within_commitment(new.expense_id);
  if tg_op = 'UPDATE' and new.expense_id <> old.expense_id then
    perform kita.assert_payments_within_commitment(old.expense_id);
  end if;
  return null;
end $$;
-- Deferred to commit time so a deposit and a corrected commitment can be saved in one transaction.
create constraint trigger payments_within_commitment
  after insert or update on kita.payments
  deferrable initially deferred
  for each row execute function kita.payments_check();

create function kita.expenses_check() returns trigger
language plpgsql as $$
begin
  perform kita.assert_payments_within_commitment(new.id);
  return null;
end $$;
create constraint trigger expense_commitment_covers_payments
  after update of committed_sen, allow_overpayment on kita.expenses
  deferrable initially deferred
  for each row execute function kita.expenses_check();

-- ---------------------------------------------------------------------------
-- updated_at / version triggers and row level security on every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces', 'workspace_members', 'planning_events', 'budget_categories', 'vendors',
    'vendor_bookings', 'expenses', 'payments', 'tasks', 'calendar_events', 'guests', 'notes', 'documents'
  ] loop
    execute format('create trigger touch_row before update on kita.%I for each row execute function kita.touch_row()', t);
    execute format('alter table kita.%I enable row level security', t);
  end loop;
end $$;
alter table kita.activity_log enable row level security;

-- ---------------------------------------------------------------------------
-- Keep Supabase's API roles out. Only the backend's database role reaches this schema.
-- ---------------------------------------------------------------------------
revoke all on schema kita from public, anon, authenticated;
revoke all on all tables    in schema kita from anon, authenticated;
revoke all on all sequences in schema kita from anon, authenticated;
revoke all on all functions in schema kita from public, anon, authenticated;
alter default privileges in schema kita revoke all on tables    from anon, authenticated;
alter default privileges in schema kita revoke all on sequences from anon, authenticated;
alter default privileges in schema kita revoke all on functions from public, anon, authenticated;
