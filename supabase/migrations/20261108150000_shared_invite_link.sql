-- One shared invitation link per event, for sending to groups. Guests who answer through it type
-- their name, phone and headcount, and are added to the guest list with their own private link.
alter table kita.planning_events
  add column invite_token text unique check (invite_token is null or length(invite_token) between 20 and 64);
