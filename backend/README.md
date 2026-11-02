# kita. API

FastAPI backend for the planner. It is the only client of the database: it verifies the Supabase login token on every request, checks the user belongs to the workspace, and only reads or writes rows in the planning event (mode) named in the URL.

## Run locally

```bash
python -m venv ~/.venvs/kita-backend            # keep it outside OneDrive
~/.venvs/kita-backend/Scripts/pip install -r requirements-dev.txt
cp .env.example .env                            # then fill in the real values
~/.venvs/kita-backend/Scripts/uvicorn app.main:app --reload
```

Interactive API docs: http://127.0.0.1:8000/api/docs

## Tests

The tests use a throwaway local PostgreSQL in Docker and never touch Supabase. They refuse to run against anything but `localhost`.

```bash
docker run -d --name kita-test-db -e POSTGRES_PASSWORD=kita-test -e POSTGRES_DB=kita_test -p 127.0.0.1:54329:5432 postgres:17-alpine
~/.venvs/kita-backend/Scripts/python -m pytest
```

Each run rebuilds the schema from `supabase/migrations/`, so the tests always match the real database. Tests named `test_spec_*` cover the critical cases in section 13 of the spec (1, 2, 3, 4, 5 and 9).

## Configuration

| Variable | Needed | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase pooler URL. Locally the session pooler (port 5432); on Vercel the transaction pooler (port 6543) |
| `SUPABASE_URL` | Yes | Project URL, used to fetch the public keys that sign login tokens (ES256) |
| `SUPABASE_JWT_SECRET` | No | Only for projects still on the legacy shared secret |
| `CORS_ORIGINS` | No | JSON list of origins, only when the frontend is served from another address |
| `VERCEL` | Set by Vercel | Switches off connection pooling inside serverless functions |

## API overview

All routes are under `/api/v1` and need `Authorization: Bearer <Supabase access token>`, except `/health`.

| Area | Routes |
|---|---|
| Account | `GET /me`, `GET/PATCH /workspaces/current`, `GET /activity` |
| Modes | `GET/POST /planning-events`, `GET/PATCH /planning-events/{id}`, `GET …/{id}/dashboard` |
| Checklist | `…/{id}/tasks` (list with `status`, `open_only`, `assignee`, `category`), `…/tasks/{task}`, `POST …/tasks/{task}/move` |
| Budget | `…/budget/summary`, `…/budget-categories`, `…/expenses`, `POST/DELETE …/expenses/{e}/payments` |
| Vendors | `…/{id}/vendors` (bookings), `GET/PATCH /vendor-contacts` (shared by both modes) |
| Calendar | `GET …/{id}/calendar?range=upcoming\|past\|all&include_other_mode=`, `…/calendar-events` |
| Guests | `…/{id}/guests` (filters `side`, `rsvp`, `q`), `POST …/guests/copy-from-other-mode` |
| Notes, documents | `…/{id}/notes`, `…/{id}/documents` |

**Saving changes.** Every `PATCH` body includes the `version` the app last loaded. If someone else saved in between, the API answers `409` with the current row in `detail.current`, so the app can show the newer version instead of overwriting it.

**Money** is always integer sen: `125050` is RM 1,250.50.

**Errors** come back as `{"detail": "..."}` in plain English: `401` sign in again, `403` not in a workspace, `404` not found (also for anything in someone else's workspace), `409` edit conflict or duplicate, `422` invalid value or a database rule such as overpayment.

## Document files

The browser uploads files straight to the private `documents` storage bucket, at
`<workspace id>/<planning event id>/<random name>`. Storage policies let only members of that workspace
upload, open (via short-lived signed links) or delete them; see
`supabase/migrations/20261102150000_document_storage.sql`. `POST .../documents` then records the name,
type and size, and refuses paths outside the caller's own plan.
