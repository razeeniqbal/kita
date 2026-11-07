-- RSVP links: each guest can get a private link to a public invitation page where they answer.
-- The page shows the milestone's venue, time and RSVP-by date, so those are stored on the event.

alter table kita.planning_events
  add column venue      text not null default '' check (length(venue) <= 200),
  add column start_time time,
  add column rsvp_by    date;

alter table kita.guests
  -- Random and unguessable; null until the couple shares the guest's link, and again if they turn it off.
  add column rsvp_token   text unique check (rsvp_token is null or length(rsvp_token) between 20 and 64),
  add column rsvp_note    text not null default '' check (length(rsvp_note) <= 500),
  add column responded_at timestamptz;
