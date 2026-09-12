# Shopify AI Business Intelligence — Phase 1

Single-store Shopify BI platform: syncs Shopify data → computes metrics → runs
rule-based alerts → generates AI reports and answers chat questions grounded
in the store's real data.

See `PLAN.md` for the full architecture/build-milestone plan.

## Milestone status

- [x] **M1 — Scaffold + credentials + manual import**
- [ ] M2 — Webhooks + reconciliation
- [ ] M3 — Metrics Engine
- [ ] M4 — Rules Engine + Alerts
- [ ] M5 — Dashboard + core UI
- [ ] M6 — AI weekly report
- [ ] M7 — AI chat
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

## Notes

- The Shopify access token and API secret are only ever stored encrypted (AES-256-GCM) — never returned by any API response, never logged.
- Rerunning `npm run import:historical` is safe — all syncs upsert by Shopify ID.
- Webhooks, the Metrics/Rules engines, and AI reports/chat are not implemented yet — see `PLAN.md` milestones M2–M7.
