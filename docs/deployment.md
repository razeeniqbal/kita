# Deploying kita.

One Vercel project serves everything:

```
browser ──► Vercel ──► Angular app (static files from frontend/dist/kita/browser)
               └─────► /api/*  ──► api/index.py (FastAPI, Python 3.12, region sin1)
                                        ├─► Supabase PostgreSQL (ap-southeast-1 Singapore, via the pooler)
                                        └─► Supabase Auth keys (to check sign-in tokens)
```

Everything Vercel needs is in [`vercel.json`](../vercel.json): build commands, the `/api` function, routing so links like `/tunang/budget` open the app, and security headers. Secrets are never in the repo; they go in Vercel's environment variables.

## 1. Supabase (once)

In the [Supabase dashboard](https://supabase.com/dashboard) for the project:

1. **Authentication → Sign In / Providers**: Email on; **Allow new users to sign up: off** (invite-only).
2. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**. Both are public by design. Never copy the `service_role` key anywhere.
3. **Connect → Transaction pooler**: copy the connection string (port **6543**). Serverless functions should use this one.

## 2. Vercel (once)

1. Sign in at [vercel.com](https://vercel.com) with GitHub, then **Add New → Project → Import** `razeeniqbal/kita`.
2. Leave **Framework Preset** as *Other* and **Root Directory** as the repository root. `vercel.json` sets the build.
3. **Environment Variables** (Production and Preview):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Transaction pooler URL, e.g. `postgresql://postgres.<project-ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require` |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_ANON_KEY` | The anon / publishable key |

4. **Deploy.** When it finishes, open `https://<your-app>.vercel.app/api/v1/health`. It should show `{"status":"ok"}`, which means the API reached the database.
5. Optional: **Settings → Domains** to add your own domain.

If the build complains about Node.js, set **Settings → Build and Deployment → Node.js Version** to 22.x or newer (Angular 22 needs it).

## 3. Connect sign-in to the live address (once)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://<your-app>.vercel.app` (or your domain)
- **Redirect URLs**: the same address, plus `https://<your-app>.vercel.app/set-password` and `http://localhost:4200` for local development

## 4. Invite Razeen and Sabrina

1. Supabase → **Authentication → Users → Invite user**, once for each email.
2. Each of you opens the invitation email, sets a password, and lands in kita. It will say **"Almost there"**: the account exists but isn't linked to the workspace yet.
3. Link the accounts (Supabase → **SQL Editor**), with your real emails:

   ```sql
   insert into kita.workspace_members (workspace_id, user_id, partner_slot, role)
   select w.id, u.id, m.slot, m.role::kita.member_role
   from kita.workspaces w
   cross join (values ('razeen@example.com', 1, 'OWNER'), ('sabrina@example.com', 2, 'EDITOR')) as m (email, slot, role)
   join auth.users u on lower(u.email) = lower(m.email);
   ```

4. Sign in again. You're in.

## After that

- **Every push to `main` deploys automatically.** Other branches get preview deployments; they use the same live database, so don't test destructive changes there.
- **Schema changes** go in a new file in `supabase/migrations/`, applied before the code that needs it is deployed.
- **Supabase free plan pauses** a project after 7 days without use. Using the app weekly keeps it awake; otherwise unpause it from the dashboard, or upgrade.
- **Region:** the database (Supabase `ap-southeast-1`) and the API function (Vercel `sin1`) are both in Singapore, close to Malaysia. The project moved there from Ireland on 2 November 2026 with `scripts/copy_supabase_project.py`, which copies the schema, data and sign-in accounts (passwords included) between two projects and checks every table matches.

## Checked before the first deploy

The configuration was exercised locally with a stand-in for Vercel's runtime: `api/index.py` loaded the app and answered `/api/v1/*` against a seeded database; deep links fell back to the app; every header in `vercel.json` was applied; and the production build rendered fully styled under the Content-Security-Policy, with no blocked resources. What could not be tested without a Vercel account: the Vercel build itself and Python packaging in the function.
