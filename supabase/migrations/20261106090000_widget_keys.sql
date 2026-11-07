-- Home Screen widget keys: one per person, used by the Scriptable widget to read a short summary.
-- Only a SHA-256 hash is stored; making a new key replaces the old one, which stops working.

create table kita.widget_keys (
  user_id      uuid primary key,
  workspace_id uuid not null,
  key_hash     text not null unique check (length(key_hash) = 64),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  foreign key (workspace_id, user_id)
    references kita.workspace_members (workspace_id, user_id) on delete cascade
);

alter table kita.widget_keys enable row level security;
revoke all on kita.widget_keys from anon, authenticated;
