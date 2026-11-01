# kita.

**Our journey, thoughtfully planned.**

A private, shared planner for Razeen & Sabrina, with two independent modes:

- **Tunang**: engagement planning
- **Perkahwinan**: nikah and wedding planning, including optional sanding / reception

Each mode has its own dashboard, checklist, budget and payments, calendar, guests, vendors, notes and documents. Nothing from one mode is counted in the other. The full product brief is in [`docs/spec-v1.2.md`](docs/spec-v1.2.md).

## Repository layout

```text
kita/
├── docs/
│   ├── spec-v1.2.md            # current product spec (approved assets, BM checklists)
│   ├── spec-v1.0.md            # first spec, kept for reference
│   └── database.md             # schema overview and design decisions
├── assets/
│   └── source/                 # the 12 approved original images, unchanged
├── backend/                    # FastAPI API (see backend/README.md)
│   ├── app/                    # routes, auth, database access
│   ├── tests/                  # pytest suite, runs against local Docker PostgreSQL
│   └── .env.example            # copy to backend/.env (git-ignored)
├── supabase/
│   ├── migrations/             # SQL schema migrations
│   └── seed.sql                # workspace, both modes, BM starter checklists
├── frontend/
│   └── public/assets/kita/     # optimised WebP copies (480w and 960w) served by the app
├── prototype/
│   └── kita.html               # working prototype, published as a claude.ai artifact
└── scripts/
    └── optimize_assets.py      # rebuilds frontend/public/assets/kita from assets/source
```

The database schema and starter checklists are live on Supabase; see [`docs/database.md`](docs/database.md). The FastAPI backend is built and tested; see [`backend/README.md`](backend/README.md). The Angular frontend is not started yet.

## Prototype

`prototype/kita.html` is a single-page version of the app, used to settle the design and flows before the real build. It runs as a private claude.ai artifact and stores its data in that artifact's built-in database, so it does not run on its own from this folder. Treat it as a design and behaviour reference:

- English interface; checklist tasks and their sections in Bahasa Melayu
- Light and dark mode, with a per-device Appearance setting
- Separate Tunang and Perkahwinan data, activity log, conflict warning when both of you edit the same item
- Money stored as integer sen; dates in Asia/Kuala_Lumpur

It loads images from `assets/kita/` relative to the page, which matches `frontend/public/assets/kita/` when served from `frontend/public/`.

## Artwork

The originals in `assets/source/` are never edited. To rebuild the web copies:

```bash
pip install pillow
python scripts/optimize_assets.py
```

This writes 480px and 960px WebP files (about 460 KB in total, down from 22 MB). The heart emblem is cropped, given a transparent background, and also exported as `brand-heart-dark-*` with the graphite ribbon in ivory for dark mode.

| Image | Used for |
|---|---|
| `brand-heart` / `brand-heart-dark` | Header emblem, landing page |
| `botanical-border` | Landing page background, empty vendor list |
| `journey-ribbons` | "Our milestones" on the landing page |
| `tunang-cover` | Tunang mode card and overview |
| `perkahwinan-cover` | Perkahwinan mode card and overview |
| `checklist-papers` | Empty checklist |
| `budget-jar` | Empty budget |
| `calendar-editorial` | Empty calendar (desktop) |
| `calendar-icon-illustration` | Empty calendar (phone) |
| `guests-envelopes` | Empty guest list |
| `documents-stationery` | Empty documents |
| `notes-cards` | Empty notes |

## Still to decide

From section 14 of the spec:

- Supabase project details, auth approach and row-level security policies
- Hosting for the Angular frontend and FastAPI backend
- Notification preferences
- Final logo, and whether to keep the name **kita.**

## Privacy

This repository is public. Your actual plan (tasks, budget, guests, documents) lives in the app's database, not here. Never commit Supabase service-role keys, `.env` files or real guest contact details.
