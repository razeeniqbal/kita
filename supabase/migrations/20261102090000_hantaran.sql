-- Hantaran: the items exchanged on dulang (trays), per planning mode.
-- Each item can link to a budget expense (its cost) and a checklist task, both in the same mode.

create type kita.hantaran_status as enum ('PLANNED', 'BUYING', 'BOUGHT', 'DECORATED', 'READY');

-- Target for the composite foreign key below, so an item can only link to a task in its own mode.
alter table kita.tasks add constraint tasks_event_id_unique unique (planning_event_id, id);

create table kita.hantaran_items (
  id                uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references kita.planning_events (id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 160),
  -- Which family gives the tray: the groom's side gives, the bride's side usually returns (balas).
  giver             kita.family_side not null default 'PARTNER_1' check (giver <> 'BOTH'),
  tray_number       smallint check (tray_number between 1 and 99),
  status            kita.hantaran_status not null default 'PLANNED',
  assignee          kita.assignee not null default 'UNASSIGNED',
  expense_id        uuid,
  task_id           uuid,
  notes             text not null default '',
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  version           integer not null default 1,
  foreign key (planning_event_id, expense_id)
    references kita.expenses (planning_event_id, id) on delete set null (expense_id),
  foreign key (planning_event_id, task_id)
    references kita.tasks (planning_event_id, id) on delete set null (task_id)
);
create index hantaran_items_event_idx on kita.hantaran_items (planning_event_id, giver, tray_number);

create trigger touch_row before update on kita.hantaran_items for each row execute function kita.touch_row();
alter table kita.hantaran_items enable row level security;
revoke all on kita.hantaran_items from anon, authenticated;
