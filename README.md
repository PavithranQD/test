# Shopify AI Business Intelligence — Phase 1

Single-store Shopify BI platform: syncs Shopify data → computes metrics → runs
rule-based alerts → generates AI reports and answers chat questions grounded
in the store's real data.

See `PLAN.md` for the full architecture/build-milestone plan.

## Milestone status

- [x] **M1 — Scaffold + credentials + manual import**
- [x] **M2 — Webhooks + reconciliation**
- [x] **M3 — Metrics Engine**
- [x] **M4 — Rules Engine + Alerts**
- [x] **M5 — Dashboard + core UI**
- [ ] M6 — AI weekly report (needs `ANTHROPIC_API_KEY`)
- [ ] M7 — AI chat (needs `ANTHROPIC_API_KEY`)
- [ ] M8 — Hardening

## Setup (M1)

### 1. Install dependencies

```
npm install
```

### 2. Provision Postgres

Any reachable Postgres works for local dev (a local install, or a free Neon/Supabase project — recommended if you'll later deploy web to Vercel, since the worker and web app need to reach the same DB from different hosts).

### 3. Configure environment

```
cp .env.example .env
```

Fill in:

- `DATABASE_URL` — your Postgres connection string.
- `ENCRYPTION_KEY` — generate with `openssl rand -base64 32`. Used to encrypt the Shopify token at rest; losing it means re-entering Shopify credentials.
- `ADMIN_EMAIL` — the email you'll log in with.
- `ADMIN_PASSWORD_HASH` — generate with:
  ```
  npm run hash-password --workspace=apps/worker -- "your-password-here"
  ```
- `ANTHROPIC_API_KEY` — needed starting at M6 (AI reports); not required for M1.
- `APP_BASE_URL` — needed starting at M2 (webhook registration); not required for M1.

### 4. Run the database migration

```
npm run prisma:migrate
```

### 5. Start the web app

```
npm run dev:web
```

Visit `http://localhost:3000`, log in with `ADMIN_EMAIL` / the password you hashed.

### 6. Create a Shopify Custom App

In the target store's Shopify Admin:

1. Settings → Apps and sales channels → Develop apps → Create an app.
2. Configure Admin API scopes: `read_products`, `read_orders`, `read_customers`, `read_inventory`, `read_discounts`.
3. Install the app.
4. Copy the **Admin API access token**, and the app's **API key** and **API secret**.

### 7. Connect the store

In the running web app, go to Settings → paste the shop domain (`your-store.myshopify.com`) and the credentials from step 6 → Connect store.

### 8. Run the historical import

```
npm run import:historical
```

Pulls 12 months of products, variants, inventory, customers, and orders (with line items, refunds, discount usage) into Postgres. Check progress/results with:

```
npm run prisma:studio
```

Once this completes, the Dashboard, Products, and Inventory pages in the web app will show real synced data.

## Deploying to Render

1. **Postgres**: create a Render Postgres instance (or keep using Neon/Supabase) and copy its connection string.
2. **Web Service** (not Static Site — this app has API routes, middleware, and server components hitting Postgres at request time, none of which a static host can run):
   - Root Directory: leave blank (repo root) — `npm install` must run at the workspace root so `@repo/core`/`@repo/db` link correctly.
   - Build Command: `npm install && npm run prisma:generate && npm run prisma:migrate:deploy && npm run build --workspace=apps/web`
   - Start Command: `npm run start --workspace=apps/web`
   - Environment variables: `DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (same values as your local `.env`), plus `APP_BASE_URL` set to the `https://<service>.onrender.com` URL Render assigns once the service exists.
3. Run the historical import once from your own machine with `DATABASE_URL` pointed at the Render Postgres's *external* connection string — no need to run it on Render itself.
4. **Background Worker** (as of M2, `apps/worker` has a real persistent job — sync reconciliation runs every 6 hours — so it's worth deploying now):
   - Create a Render **Background Worker** (not Web Service — it doesn't listen on a port).
   - Root Directory: leave blank (repo root), same reasoning as the web service.
   - Build Command: `npm install && npm run prisma:generate`
   - Start Command: `npm run dev:worker` (or build+run compiled JS if you prefer — `npm run build --workspace=apps/worker && node apps/worker/dist/index.js`)
   - Environment variables: `DATABASE_URL`, `ENCRYPTION_KEY` (same values as the Web Service — `ANTHROPIC_API_KEY`/`APP_BASE_URL` not needed by the worker yet).
5. After connecting the store (or reconnecting), webhooks are registered automatically against `APP_BASE_URL` — check Shopify Admin → Settings → Notifications → Webhooks to confirm they show up, or watch the Web Service logs when a test order is created/updated in the store.

## Notes

- The Shopify access token and API secret are only ever stored encrypted (AES-256-GCM) — never returned by any API response, never logged.
- Rerunning `npm run import:historical` is safe — all syncs upsert by Shopify ID.
- Webhooks, the Metrics/Rules engines, and AI reports/chat are not implemented yet — see `PLAN.md` milestones M2–M7.
