# Database

Schema for the Supabase PostgreSQL 17 project, based on section 9 of [`spec-v1.2.md`](spec-v1.2.md).

| File | What it does |
|---|---|
| [`supabase/migrations/20261101130000_initial_schema.sql`](../supabase/migrations/20261101130000_initial_schema.sql) | Creates the `kita` schema: 14 tables, enums, rules and access lock-down |
| [`supabase/seed.sql`](../supabase/seed.sql) | Adds the workspace, both planning events, budget categories and the 48 Bahasa Melayu starter tasks |

## Tables

| Table | Belongs to | Notes |
|---|---|---|
| `workspaces` | — | Holds both partner names |
| `workspace_members` | workspace | Links a Supabase Auth user to partner slot 1 or 2 |
| `planning_events` | workspace | One per mode (`TUNANG`, `PERKAHWINAN`): name, date, status, target budget |
| `tasks` | event | Status, priority, due date, assignee, BM category, optional linked expense |
| `budget_categories` | event | Category list for each mode's budget |
| `expenses` | event | Planned, quoted and committed amounts, balance due date |
| `payments` | expense | Deposits and final payments, with who paid |
| `vendors` | workspace | Contact details, reusable in both modes |
| `vendor_bookings` | event | A vendor's status and quote for one mode |
| `calendar_events` | event | Appointments, venue visits, family discussions, fittings |
| `guests` | event | Family side, group, invitation, RSVP, seats |
| `notes` | event | Decisions and inspiration links, can be pinned |
| `documents` | event | Metadata for files in private Supabase Storage |
| `activity_log` | workspace | Append-only record of who changed what |

## Decisions to review

**Private schema, backend-only access.** Tables live in a `kita` schema that Supabase's Data API does not expose. Row level security is on with no policies, and Supabase's `anon` and `authenticated` roles get no grants. This follows the spec's recommendation that all writes go through FastAPI. The flip side is that FastAPI must check membership and mode on every request (spec test case 4). If you later want the Angular app to read some tables directly through Supabase, that table needs RLS policies and grants added in a new migration.

**Mode isolation in the database.** Links that could cross modes (task → expense, expense → budget category or vendor booking) are composite foreign keys that include `planning_event_id`. A task in Tunang cannot point at a Perkahwinan expense even if the API has a bug. Moving a task to the other mode means updating its `planning_event_id`, recording `moved_from_event_id`, and clearing `expense_id` in the same update.

**People as partner slots, not user ids.** The spec lists `assignee_user_id` and `paid_by_user_id`, but it also needs "Both", "Unassigned" and "Family / other", which a user id can't express. Assignee, family side and payer are enums (`PARTNER_1`, `PARTNER_2`, `BOTH`, ...). `workspace_members.partner_slot` maps each slot to a login, and the names come from `workspaces`. Activity log and `created_by` / `updated_by` still record the real user id.

**Planned amount per expense.** The spec puts `planned_amount` on budget categories. The prototype puts planned, quoted and committed on each expense line, and that worked well, so this schema follows the prototype. A category's planned total is the sum of its expenses.

**Rules the database enforces:**
- Money is integer sen, never negative. Payments must be above zero.
- Payments for an expense cannot add up to more than its committed amount unless `allow_overpayment` is set. The check runs at commit time, so a payment and a corrected commitment can be saved together. Expenses with no commitment yet are not limited.
- `completed_at` is set automatically when a task becomes `DONE` and cleared otherwise.
- Every editable row has a `version` that goes up on each update. The API should update with `where id = $1 and version = $2` and return 409 when nothing matches, so one partner's change is never silently overwritten (spec test case 9).
- Documents are capped at 15 MB.

**No Alembic for now.** The spec suggests SQLAlchemy and Alembic. Because Supabase also manages auth and storage, plain SQL migrations in `supabase/migrations/` are simpler to review and work with the Supabase CLI. FastAPI can still map these tables with SQLAlchemy models.

## Status

Applied to the Supabase project on 1 November 2026, in one transaction with the seed. The migration is recorded in `supabase_migrations.schema_migrations`, so `supabase db push` will not run it again.

These rules were checked against the live database inside a transaction that was rolled back afterwards: payments within the commitment save; overpayment, lowering a commitment below what is paid, zero payments and negative budgets are rejected; overpayment saves when allowed; a Tunang task cannot link to a Perkahwinan expense or move modes while linked to one; `version` goes up on every update and a stale version matches no rows; `completed_at` follows `DONE`; the `anon` and `authenticated` roles are denied.

## Still to do

- Invite Razeen and Sabrina in Supabase Auth, then add their rows to `workspace_members`.
- Create a private Storage bucket for documents.
- Optionally, a dedicated database role for FastAPI with access to `kita` only, instead of `postgres`.

## Applying

With the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

Or run both files in order in the Supabase SQL editor. Use the session pooler URL from `backend/.env` on networks without public IPv6.
