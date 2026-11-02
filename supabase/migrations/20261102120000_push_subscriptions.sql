-- Web push: one row per device (browser or installed app) that turned notifications on.
-- Each device keeps its own choices; removing someone from the workspace removes their devices.

create table kita.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  user_id         uuid not null,
  -- The push service URL the browser handed out. Unique per device, and the key the app looks up by.
  endpoint        text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh          text not null check (length(p256dh) <= 200),
  auth            text not null check (length(auth) <= 100),
  partner_updates boolean not null default true,
  daily_digest    boolean not null default true,
  created_at      timestamptz not null default now(),
  last_sent_at    timestamptz,
  foreign key (workspace_id, user_id)
    references kita.workspace_members (workspace_id, user_id) on delete cascade
);
create index push_subscriptions_workspace_idx on kita.push_subscriptions (workspace_id, user_id);

alter table kita.push_subscriptions enable row level security;
revoke all on kita.push_subscriptions from anon, authenticated;
