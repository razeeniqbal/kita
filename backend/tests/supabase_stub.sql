-- The parts of a Supabase database the kita migration depends on, for a plain local PostgreSQL.
do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create schema auth;
create table auth.users (
  id    uuid primary key,
  email text
);
