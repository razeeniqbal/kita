# Razeen & Sabrina — Engagement & Wedding Planner

> **Working name:** KITA.  
> **Tagline:** Our journey, thoughtfully planned.  
> **Owners:** Razeen & Sabrina  
> **Product:** Private, shared, Apple-inspired planning web application  
> **Status:** Product specification / implementation brief (v1.0)

## 1. Vision

Build a calm, elegant, private web app where **Razeen and Sabrina** plan their milestones together. The interface should feel like an Apple first-party application: precise typography, restrained color, generous whitespace, refined rounded surfaces, clear hierarchy, subtle motion, and excellent mobile usability.

The application has **two distinct modes**:

1. **Tunang Mode** — engagement planning only.
2. **Perkahwinan Mode** — marriage and wedding planning only, including Nikah and optional Sanding/reception activities.

The modes must have **separate dashboards, checklists, budgets, timelines, vendors, guests, documents, and progress**. Users can switch modes from a persistent mode selector. No engagement items should accidentally appear in wedding totals, or vice versa. A shared couple profile, account settings, and optional joint calendar overview may exist outside the two modes.

**Important:** Both modes should be accessible independently; completing Tunang is **not** a prerequisite for opening Perkahwinan. Each mode can be configured with its own date and planning status. The app is not a public wedding website or marketplace.

## 2. Audience and access

- **Razeen:** co-owner and editor.
- **Sabrina:** co-owner and editor.
- Both users have equal access to their private workspace and may assign tasks to themselves, each other, or both.
- Invitation-only authentication; no public registration or publicly accessible private content.
- Keep a minimal activity log showing who updated a task, budget entry, or booking and when.
- Default locale: **English with natural Malay wedding terminology** (Tunang, Nikah, Sanding, hantaran, mas kahwin, etc.). Design for future BM/English language switching.
- Default currency: **MYR (RM)**; timezone: **Asia/Kuala_Lumpur**; dates displayed in a readable Malaysian format.

## 3. Navigation and information architecture

### Global shell

- Header: `kita.` wordmark, `Razeen & Sabrina`, notification icon, shared profile menu.
- Prominent segmented mode switcher: **Tunang | Perkahwinan**.
- Desktop: narrow sidebar with contextual links; mobile: compact bottom navigation with a visible mode selector.
- Each mode remembers its own last-visited page.

### Tunang Mode routes

| Route | Screen | Purpose |
|---|---|---|
| `/tunang` | Tunang Overview | Engagement countdown, progress, upcoming actions |
| `/tunang/checklist` | Checklist | Engagement-specific tasks and assignments |
| `/tunang/budget` | Budget | Engagement budget, expenses, payments |
| `/tunang/calendar` | Calendar | Engagement dates, deadlines, appointments |
| `/tunang/guests` | Guests | Family and invited guests for engagement |
| `/tunang/vendors` | Vendors | Ring, attire, makeup, photography, food, decoration |
| `/tunang/notes` | Notes & Inspiration | Decisions, inspiration links, reference photos |
| `/tunang/documents` | Documents | Quotations, receipts, agreements |

### Perkahwinan Mode routes

| Route | Screen | Purpose |
|---|---|---|
| `/perkahwinan` | Wedding Overview | Wedding countdown, progress, major milestones |
| `/perkahwinan/checklist` | Checklist | Nikah and optional Sanding/reception task groups |
| `/perkahwinan/budget` | Budget | Wedding budget, expenses, deposits, balances |
| `/perkahwinan/calendar` | Calendar | Marriage appointments, bookings, payment dates |
| `/perkahwinan/guests` | Guests & RSVP | Invitations, family-side grouping, RSVP |
| `/perkahwinan/vendors` | Vendors | Venue, catering, attire, photography, etc. |
| `/perkahwinan/notes` | Notes & Inspiration | Moodboards and decisions |
| `/perkahwinan/documents` | Documents | Required paperwork, contracts, receipts |

### Shared routes

- `/settings` — profile, partner invite, notifications, privacy, currency, language.
- `/our-story` — optional private timeline of shared milestones, with no public exposure.

## 4. Mode behavior and isolation

**Mode is a first-class data boundary, not merely a visual filter.** Every mode-scoped record belongs to a `planning_event` with `mode = TUNANG` or `PERKAHWINAN` and to the couple's private workspace.

- Switching mode changes the entire contextual navigation and all relevant KPIs.
- Checklists, expenses, guest counts, vendor commitments, and progress are calculated **only** from the active mode.
- A user may create both modes on day one, or activate one later.
- Provide distinct accent treatments per mode while maintaining a consistent Apple-style design system.
- Optional wedding subcategories (`NIKAH`, `SANDING`, `RECEPTION`, `OTHER`) are **sections within Perkahwinan Mode**, not a third global mode.
- Prevent accidental cross-mode edits in both frontend and backend validation.
- Support moving an item to the other mode only via an explicit, confirmed action, preserving history.

## 5. Core features

### 5.1 Dashboard (per mode)

- Personalized greeting: `Razeen & Sabrina`.
- Hero card: milestone name, target date, countdown (or `Date to be decided`).
- Completion progress: completed checklist items / applicable checklist items.
- Budget summary: planned, committed, paid, remaining; show definitions clearly.
- Next actions: nearest incomplete tasks, sorted by due date and urgency.
- Upcoming calendar items and vendor payment deadlines.
- Gentle empty states; no fabricated dates or costs.

### 5.2 Shared checklist

Task fields: title, description, mode, wedding subcategory (if applicable), status, priority, due date, assignee (`Razeen`, `Sabrina`, `Both`, `Unassigned`), optional cost link, attachments, timestamps.

Suggested statuses: `Not started`, `In progress`, `Blocked`, `Done`, `Not applicable`.

Capabilities: add/edit/delete, group by category, filter by owner/status, mark complete, due-soon indicator, optional dependencies, activity history. Templates should be editable, not hard-coded as legal advice.

### 5.3 Budget and payments

- Set **separate target budgets** for Tunang and Perkahwinan.
- Budget categories, planned amount, quoted amount, committed amount, paid amount, balance due, payment due date.
- Vendor-linked expenses and multiple payment transactions (e.g., deposit + final payment).
- Currency MYR; prevent negative payment entries and overpayment unless explicitly handled.
- Optional contributor field for tracking which partner paid; do not assume equal splitting.
- Show totals and remaining budget with transparent calculations, e.g. `Remaining to allocate = Target budget − Sum(planned allocations)` and `Outstanding commitments = Sum(committed) − Sum(paid)`.
- Export CSV later; avoid connecting bank accounts in MVP.

### 5.4 Calendar

- Per-mode calendar and optional combined read-only view.
- Task due dates, appointments, venue visits, family discussions, payment deadlines, event date.
- Manual events first; notifications and calendar sync later.

### 5.5 Guests

- Guest name, family side (`Razeen`, `Sabrina`, `Both`), group, contact (optional), invitation status, RSVP, number of seats, notes.
- **Separate guest lists for each mode**, with an explicit copy/import feature if desired.
- Protect personal guest data; do not expose guest details publicly.

### 5.6 Vendors

- Vendor name, category, contact, quotation, status (`Considering`, `Shortlisted`, `Booked`, `Completed`, `Cancelled`), notes, contract/receipt attachments.
- Each vendor booking is tied to a mode. A vendor contact can be reused, but bookings and expenses remain mode-specific.

### 5.7 Notes, inspiration and documents

- Shared notes, pinned decisions, links, moodboard/reference images.
- Private uploads: quotations, contracts, receipts, supporting paperwork.
- Limit file size/type, validate uploads server-side, and use authenticated or signed access URLs.

## 6. Starter checklist templates

All items below are **editable suggestions**. Legal and religious procedures must be verified against the relevant Malaysian state authorities and current official guidance.

### Tunang template

- Discuss engagement expectations and preferred date together.
- Discuss plan with both families.
- Agree on budget and approximate guest count.
- Decide venue (home or booked location).
- Choose engagement ring and confirm sizing.
- Agree on hantaran/dulang arrangements, if applicable.
- Arrange attire and makeup.
- Arrange decoration, food/catering and photography if desired.
- Prepare invitation list and notify guests.
- Confirm event itinerary and responsible family contacts.
- Final vendor and payment checks.

### Perkahwinan template

**Nikah**
- Agree on date, location and initial budget.
- Check current state-specific marriage registration requirements.
- Arrange required courses, screening, forms and appointments where applicable.
- Confirm wali, witnesses and officiant according to applicable requirements.
- Plan mas kahwin and any agreed hantaran.
- Prepare attire, rings and ceremony logistics.
- Confirm marriage documents and appointment details.

**Sanding / reception (optional)**
- Decide whether to host a reception and set guest target.
- Book venue, catering and decoration.
- Arrange outfits, makeup, photography/videography.
- Prepare invitations, seating and RSVP tracking.
- Confirm vendors, deposits and final payments.
- Finalize event-day run sheet, logistics and family responsibilities.

## 7. Apple-inspired visual design system

### Design principles

1. **Quiet luxury:** premium but understated; no heavy gradients or crowded wedding motifs.
2. **Clarity first:** typography, whitespace and content hierarchy over decoration.
3. **Native feel:** responsive interactions, subtle transitions, consistent control sizing.
4. **Accessible:** keyboard navigation, visible focus rings, semantic labels, good contrast, reduced-motion support.
5. **Privacy-forward:** the app feels like a personal shared space, not social media.

### Color tokens

| Token | Value | Usage |
|---|---|---|
| `--background` | `#F5F5F7` | App canvas |
| `--surface` | `#FFFFFF` | Cards, dialogs |
| `--text-primary` | `#1D1D1F` | Headings and body |
| `--text-secondary` | `#6E6E73` | Supporting copy |
| `--border` | `#E5E5EA` | Dividers and strokes |
| `--tunang-accent` | `#B68D86` | Muted rose, engagement mode |
| `--wedding-accent` | `#8D9A8A` | Soft sage, wedding mode |
| `--success` | `#248A52` | Confirmed/completed states |
| `--danger` | `#C43D3D` | Errors and destructive actions |

Use neutral surfaces with **one active mode accent**. Avoid color-only status communication. Add dark mode later with separate semantic tokens.

### Typography and components

- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", sans-serif` (do not bundle proprietary Apple fonts).
- Headlines: 28–36px on desktop, 24–30px on mobile; body: 15–16px.
- Radius: 12px for inputs/buttons; 18–24px for primary cards.
- Shadows: low opacity, subtle elevation; borders often preferable to shadows.
- Spacing: 4/8/12/16/24/32px scale.
- Icons: Lucide; no emoji-only critical controls.
- Buttons: clear primary/secondary/destructive hierarchy.
- Motion: ~150–250ms for small transitions; respect `prefers-reduced-motion`.
- Optional frosted-glass header, only where contrast remains sufficient.
- Desktop: max-width content area ~1280px. Mobile: minimum comfortable 44px touch targets.

### Example dashboard copy

**Global:** `kita.` / `Razeen & Sabrina`  
**Tunang:** `Our engagement journey` · `One step closer, together.`  
**Perkahwinan:** `Our wedding journey` · `The beginning of our forever.`  
**Empty date:** `We haven't picked a date yet.`  
**Empty tasks:** `Start with one small step.`

## 8. Technology stack

### Frontend — Angular

- **Angular** (current stable release at implementation time), standalone components, TypeScript strict mode.
- Angular Router with lazy-loaded mode-specific features and route guards.
- Angular Signals for local UI state; RxJS for asynchronous streams where appropriate.
- Tailwind CSS for styling with semantic design tokens; custom accessible components or Angular CDK for overlays and dialogs.
- Angular Reactive Forms with validation.
- PWA support via Angular service worker, after core online flows work reliably.
- Vitest/Jest or Angular's supported testing setup for unit tests; Playwright for end-to-end tests.

### Backend — Python

- **FastAPI** for REST endpoints and OpenAPI documentation.
- Pydantic for request/response schemas and validation.
- SQLAlchemy 2.x + Alembic for relational persistence and migrations **if using a directly managed PostgreSQL connection**.
- Python service enforces workspace membership and mode ownership on every protected query and mutation.
- Async jobs/reminders only when needed; keep MVP synchronous and simple.
- Pytest for API, authorization and budget-calculation tests.

### Database/auth/storage — Supabase (details pending)

- **Supabase is planned but not finalized.** Keep its project URL, keys, Auth configuration, RLS policies, database schema decisions, Storage buckets and realtime configuration as **TBD** until Razeen supplies details.
- Proposed direction: Supabase PostgreSQL + Supabase Auth + private Supabase Storage.
- Frontend sends authenticated access tokens to FastAPI; backend validates them securely and checks membership and mode access.
- Use the appropriate public/anon client key only where required; **never expose Supabase service-role/secret keys in Angular**.
- Decide deliberately whether writes go **through FastAPI** (recommended for consistent business logic) or directly through Supabase client APIs. Avoid a confusing hybrid with duplicate authorization rules.
- If FastAPI uses privileged database access, implement and test explicit tenant authorization; RLS does not automatically protect queries performed with bypass privileges.

### Deployment — proposed

- Angular static frontend: Vercel or another static host.
- Python FastAPI: a Python-capable hosting service (e.g., Render, Railway, or Cloud Run).
- Supabase: managed PostgreSQL/Auth/Storage once configured.
- Environment-specific configuration for dev/staging/prod; CORS restricted to allowed frontend origins; HTTPS everywhere.

## 9. Proposed data model (draft, subject to Supabase decisions)

| Entity | Key fields / relationships |
|---|---|
| `workspaces` | `id`, `name`, `created_at` |
| `workspace_members` | `workspace_id`, `user_id`, `display_name`, `role` |
| `planning_events` | `id`, `workspace_id`, `mode` (`TUNANG` / `PERKAHWINAN`), `event_name`, `target_date`, `status`, `target_budget` |
| `tasks` | `id`, `planning_event_id`, `title`, `category`, `subcategory`, `status`, `assignee_user_id`, `due_date`, `completed_at` |
| `budget_categories` | `id`, `planning_event_id`, `name`, `planned_amount` |
| `expenses` | `id`, `planning_event_id`, `budget_category_id`, `vendor_booking_id`, `committed_amount`, `notes` |
| `payments` | `id`, `expense_id`, `amount`, `paid_at`, `paid_by_user_id`, `reference` |
| `calendar_events` | `id`, `planning_event_id`, `title`, `start_at`, `end_at`, `type` |
| `guests` | `id`, `planning_event_id`, `name`, `family_side`, `rsvp_status`, `seats` |
| `vendors` | `id`, `workspace_id`, `name`, `category`, `contact` |
| `vendor_bookings` | `id`, `planning_event_id`, `vendor_id`, `status`, `quoted_amount` |
| `notes` | `id`, `planning_event_id`, `title`, `body`, `author_user_id` |
| `documents` | `id`, `planning_event_id`, `storage_path`, `file_type`, `uploaded_by` |
| `activity_log` | `id`, `workspace_id`, `planning_event_id`, `actor_user_id`, `action`, `created_at` |

Use UUIDs, foreign keys, created/updated timestamps and indexes on `workspace_id` / `planning_event_id`. Enforce exactly one active event per mode per workspace for MVP, or explicitly support multiple events later. Store money as `NUMERIC(12,2)` or integer sen, never floating-point.

## 10. Suggested API endpoints

All endpoints below require authentication and workspace authorization. The backend must validate that nested resources belong to the requested event and workspace.

```text
GET    /api/v1/me
GET    /api/v1/workspaces/current
GET    /api/v1/planning-events
POST   /api/v1/planning-events
GET    /api/v1/planning-events/{event_id}/dashboard
GET    /api/v1/planning-events/{event_id}/tasks
POST   /api/v1/planning-events/{event_id}/tasks
PATCH  /api/v1/planning-events/{event_id}/tasks/{task_id}
DELETE /api/v1/planning-events/{event_id}/tasks/{task_id}
GET    /api/v1/planning-events/{event_id}/budget/summary
GET    /api/v1/planning-events/{event_id}/expenses
POST   /api/v1/planning-events/{event_id}/expenses
POST   /api/v1/planning-events/{event_id}/expenses/{expense_id}/payments
GET    /api/v1/planning-events/{event_id}/calendar
GET    /api/v1/planning-events/{event_id}/guests
GET    /api/v1/planning-events/{event_id}/vendors
GET    /api/v1/planning-events/{event_id}/notes
GET    /api/v1/planning-events/{event_id}/documents
```

Define full CRUD, pagination, filtering, validation and upload workflows when implementing each module. Do not return sensitive data to unauthorized users.

## 11. Recommended repository structure

```text
kita/
├── frontend/                     # Angular
│   └── src/app/
│       ├── core/                 # auth, API client, guards
│       ├── shared/               # reusable UI, formatters
│       ├── layout/               # shell, mode switcher
│       ├── features/
│       │   ├── tunang/
│       │   ├── perkahwinan/
│       │   ├── checklist/
│       │   ├── budget/
│       │   ├── calendar/
│       │   ├── guests/
│       │   ├── vendors/
│       │   └── settings/
│       └── app.routes.ts
├── backend/                      # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/
│   │   ├── core/                 # settings, auth, security
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── repositories/
│   └── tests/
├── docs/
├── .env.example
└── README.md
```

## 12. MVP phases and acceptance criteria

### Phase 1 — Foundation

- Angular app shell, responsive layout, Apple-style tokens and components.
- Invite-only login for Razeen and Sabrina.
- Shared workspace and **two-mode selector**.
- Separate Tunang and Perkahwinan dashboards, each with independent target date and countdown.
- Seed editable checklist templates for both modes.

**Acceptance:** switching modes never leaks tasks, totals or dates from the other mode; both partners see the same saved state after refresh.

### Phase 2 — Planning essentials

- Full task CRUD, assignment, filters and progress.
- Separate budgets, expenses, payment tracking and summaries.
- Per-mode calendar and upcoming deadlines.

**Acceptance:** budget calculations reconcile with underlying entries; each mode's dashboard updates from its own data only.

### Phase 3 — Event coordination

- Guests, vendors, notes and private document uploads.
- Responsive polish, error/empty/loading states, basic activity history.

**Acceptance:** only invited workspace members can access records and files; unauthorized API access is rejected.

### Phase 4 — Optional enhancements

- Push/email reminders, combined calendar, export, PWA install, offline read-only cache, photo moodboards, optional AI assistant.
- Do **not** make AI a dependency of the MVP.

## 13. Critical test cases

1. Razeen edits a Tunang task; Sabrina sees the update after reload.
2. Sabrina opens Perkahwinan; no Tunang expenses or guest counts appear.
3. Switching modes preserves each mode's date and progress.
4. A forged request referencing another event or workspace returns `403` or `404` without exposing data.
5. Expense deposits and final payments reconcile correctly, with decimal precision.
6. Users cannot access documents through public URLs or guessed storage paths.
7. Both modes work on a narrow mobile screen and keyboard-only desktop navigation.
8. No countdown is shown until a valid target date exists; past dates have a sensible completed/past-event state.
9. Concurrent edits are handled predictably; no silent loss of important budget changes.
10. Reduced-motion and accessible contrast settings are respected.

## 14. Decisions to finalize later

- [ ] Supabase project details, Auth approach, database ownership and RLS policies.
- [ ] Hosting choices for Angular and FastAPI.
- [ ] Exact Tunang and Perkahwinan dates (both optional initially).
- [ ] Whether Perkahwinan includes Sanding or Nikah only.
- [ ] Whether both users can invite additional family members (default: **no**).
- [ ] Notification delivery preferences.
- [ ] English/Bahasa Melayu switch in a later release.
- [ ] Final logo and whether to keep the name **KITA.**

---

**Product guardrail:** Build a private, beautifully simple planning tool for **Razeen & Sabrina**. Keep **Tunang** and **Perkahwinan** independent, make collaboration effortless, and favor thoughtful Apple-inspired UX over feature bloat.
