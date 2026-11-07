-- Wording for the guest invitation page: who is inviting (usually the parents), the programme
-- (one "time - item" per line) and contact numbers (one "who: number" per line).
alter table kita.planning_events
  add column invite_hosts text not null default '' check (length(invite_hosts) <= 300),
  add column programme    text not null default '' check (length(programme) <= 2000),
  add column contacts     text not null default '' check (length(contacts) <= 1000);
