# kita. web app

Angular 22 frontend: standalone components, signals, strict TypeScript, Reactive Forms, and `httpResource` for loading data. Sign-in uses Supabase Auth; every other request goes to the FastAPI backend under `/api/v1`.

## Run locally

Start the backend first (see `../backend/README.md`), then:

```bash
npm ci
npm start            # http://localhost:4200, proxies /api to http://127.0.0.1:8000
```

**node_modules lives outside OneDrive.** On this laptop `frontend/node_modules` is a directory junction to `C:\Users\AEM-Razeen\.cache\kita\frontend-node_modules`, so OneDrive doesn't sync tens of thousands of package files. On a fresh clone outside OneDrive, a normal `npm ci` is fine.

### Signing in during local development

Real sign-in needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `backend/.env`. To work against a local test database without Supabase, development builds (`npm start`) accept a token minted for a local backend:

1. Run the backend with `SUPABASE_JWT_SECRET=<any local secret>` against a local database that has your user in `kita.workspace_members`.
2. Mint an HS256 token with that secret (`sub` = the user id, `aud` = `authenticated`).
3. In the browser console: `localStorage.setItem('kita-dev-token', '<token>')`, then reload.

Production builds (`npm run build`) never read this token: `src/environments/environment.ts` has `devAuth: false`.

## Tests and build

```bash
npx ng test --watch=false     # Vitest unit tests
npm run build                 # production build into dist/kita/browser
```

## Structure

| Folder | What's there |
|---|---|
| `src/app/core` | API client, Supabase auth, session, current mode, theme, formatting, types |
| `src/app/layout` | The shell: header, Tunang/Perkahwinan switch, sidebar, phone tab bar |
| `src/app/pages` | One file per screen; mode pages serve both `/tunang/...` and `/perkahwinan/...` |
| `src/app/shared` | Icons (Lucide), artwork, sheets, rows, budget card, milestone editor |
| `public/assets/kita` | Optimised artwork, built by `../scripts/optimize_assets.py` |

Styling is one global stylesheet (`src/styles.css`) carried over from the prototype: design tokens for both themes, with the mode accent switched by a class on `<body>`. The spec suggests Tailwind; the hand-written tokens were kept because the prototype's design was already settled and tested in both themes.

## Not built yet

- Document upload (waits for a private Supabase Storage bucket).
- Vercel configuration.
