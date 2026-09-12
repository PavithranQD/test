# Phase 1 — Shopify AI Business Intelligence Platform

## Context

The user supplied `phase-1-shopify-ai-business-intelligence.md`, a spec for a Shopify-first AI BI platform (BIOS-model inspired): sync Shopify data → compute metrics → run deterministic rule-based alerts → feed structured context (never raw DB) to an AI layer → surface a dashboard, periodic AI reports, and an AI chat widget grounded in the store's real data.

Two decisions the user made up front reshape the reference spec:
1. **Single store for Phase 1** (not a self-serve multi-tenant SaaS) — this is a managed/internal tool for one known Shopify store, not a public app others install.
2. **Shopify connection via a custom app**, not public OAuth. The user creates a Custom App directly in the store's Shopify Admin (Settings → Apps → Develop apps), which issues a static Admin API access token — no Partner Dashboard app, no OAuth redirect flow, no App Store review. This removes an entire layer of the reference spec's "Auth Service" (Section 17) and replaces "Connect Shopify" (Section 21) with a one-time credential entry step.

The goal of this plan is a buildable Phase 1 that satisfies the spec's Definition of Done (Section 24) end to end, adapted for these two realities, built incrementally so each milestone is independently demoable.

The project is a brand-new codebase, unrelated to the Shopify theme repo it was scaffolded next to (that's just Liquid theme files).

## Confirmed decisions

- **Stack**: Node.js + Next.js (App Router) frontend/API, PostgreSQL, Prisma ORM.
- **Scope**: one Shopify store, custom-app token (not OAuth), Anthropic Claude (Sonnet 5) for both AI reports and chat.
- **Hosting**: Next.js web app on Vercel; a separate always-on worker process (Railway/Render/Fly.io — pick at deploy time) runs scheduled jobs, since Vercel has no persistent background-process support. Both connect to one hosted Postgres reachable from both (Neon or Supabase recommended — serverless-friendly, works well with Vercel's connection model via pooling).
- **Job scheduling**: `node-cron`, in-process inside the worker. No Redis/BullMQ for Phase 1.
- **Auth**: single admin login, custom session auth (bcrypt + signed httpOnly cookie backed by a `Session` table). No role distinctions needed yet, but the schema's `Role` enum costs nothing to include for later.
- **Package manager**: npm workspaces (monorepo), no Turborepo needed at this scale.

## Project structure — monorepo

```
shopify-bi-platform/
  package.json                    "workspaces": ["packages/*","apps/*"]
  .env.example
  packages/
    db/
      prisma/schema.prisma
      prisma/migrations/
      src/index.ts                 exports a singleton PrismaClient
    core/                          all business logic, shared by web + worker
      src/
        shopify/
          adminClient.ts           fetch wrapper for Admin REST + GraphQL, injects token
          sync/
            products.ts orders.ts customers.ts historicalImport.ts
            reconcile.ts           (M2)
          webhooks/                (M2)
            verifyHmac.ts register.ts handlers.ts
        metrics/                   (M3)
          revenue.ts orders.ts customers.ts products.ts inventory.ts discounts.ts
          engine.ts                computeDailyMetrics(storeId, date)
        rules/                     (M4)
          definitions.ts engine.ts   evaluateRules(storeId, date) -> Alert[]
        ai/                        (M6/M7)
          client.ts contextBuilder.ts reportGenerator.ts chatService.ts
        security/
          crypto.ts (AES-256-GCM)  auth.ts (bcrypt + session)  constants.ts  rateLimit.ts (M7)
        logger.ts                  pino instance
  apps/
    web/                           Next.js App Router
      middleware.ts                Edge-runtime cookie-presence redirect (real check is requireUser())
      lib/session.ts               requireUser() / getCurrentUser() — the actual auth boundary
      app/
        login/page.tsx
        (app)/layout.tsx           sidebar shell, calls requireUser()
        (app)/dashboard/page.tsx  (app)/settings/page.tsx
        (app)/reports/page.tsx  (app)/insights/page.tsx  (app)/chat/page.tsx   [placeholders until M4/M6/M7]
        (app)/products/page.tsx  (app)/inventory/page.tsx                     [real data, ranking/velocity land at M3]
        api/
          auth/login/route.ts  auth/logout/route.ts
          shopify/connect/route.ts  shopify/status/route.ts
          shopify/webhooks/[topic]/route.ts   (M2, Node runtime, raw body for HMAC)
          metrics/*, insights, alerts, reports, chat/*                        (M3-M7)
    worker/                        plain Node process (deployed separately, e.g. Railway)
      src/
        index.ts                   placeholder; node-cron schedules registered here starting M2/M3
        runHistoricalImport.ts     CLI entry, working now (M1)
        hashPassword.ts            CLI helper to generate ADMIN_PASSWORD_HASH
        jobs/                      (M2-M4) syncReconciliation.ts dailyMetrics.ts weeklyReport.ts alertDetection.ts
```

Both `apps/web` and `apps/worker` depend on `@repo/db` and `@repo/core`. Web API routes will read pre-computed tables (`DailyMetric`, `Alert`, `Report`) rather than recomputing on request once those exist — all heavy computation happens in the worker's cron jobs or incrementally in webhook handlers. This keeps Vercel function execution short and avoids serverless timeout issues.

## Database schema (Prisma) — `packages/db/prisma/schema.prisma`

Implemented. Core tables, adapted from the spec for single-store/custom-app reality:
- **`Store`** — one row = one store = one custom-app credential set. No separate `shopify_connections` table (folded in).
- **`User`** / **`Session`** — internal login for you, not Shopify merchants. No `merchants` table needed for one store.
- **`RuleThreshold`** — per-store, will be seeded with defaults for the 5 spec rules at M4.
- **`Product` / `ProductVariant` / `InventoryLevel`**, **`Customer`**, **`Order` / `OrderItem` / `Refund` / `DiscountUsage`** — raw synced data, money fields as `Decimal` (never float).
- **`DailyMetric`** / **`ProductDailyMetric`** — Metrics Engine output (M3), currently empty.
- **`Alert`** — Rules Engine output (M4), currently empty.
- **`Report`** — AI-generated periodic reports (M6), currently empty.
- **`ChatSession` / `ChatMessage`** — chat history (M7), currently empty.
- **`SyncJob`** — tracks historical import / reconciliation runs (in use since M1).
- **`WebhookEvent`** — idempotency guard for webhooks (M2), currently unused.

## Custom app credential flow — implemented (M1)

1. In Shopify Admin: create a Custom App (Develop apps), grant scopes (`read_products`, `read_orders`, `read_customers`, `read_inventory`, `read_discounts`), install it, copy the Admin API access token + API key/secret.
2. In the app, `/settings` has a form (shop domain, token, key, secret) → `POST /api/shopify/connect`.
3. Route handler validates the token against `GET /admin/api/.../shop.json`, encrypts `accessToken` and `apiSecret` with AES-256-GCM (`packages/core/src/security/crypto.ts`), writes the `Store` row.
4. Webhook registration (step originally planned here) is deferred to **M2** — not yet implemented.
5. Admin API access: a thin `adminClient.ts` wrapper (REST + GraphQL) injecting `X-Shopify-Access-Token` — not the full `@shopify/shopify-api` SDK.

**Deviation from the original plan, flagged explicitly**: historical import (`historicalImport.ts`) uses **REST cursor pagination** (`Link` header, 250/page, with 429 retry/backoff), not the GraphQL Bulk Operations API originally proposed. Bulk Operations is more efficient for very large order histories but adds real complexity (async job submission, polling, JSONL result parsing). REST pagination is simpler, well-tested here, and sufficient for a single store's 12-month history. If this store's order volume turns out to be very large (tens of thousands+ of orders) and the import is too slow, upgrading `historicalImport.ts`/`orders.ts` to Bulk Operations is a contained change — worth revisiting then rather than building it speculatively now.

## Metrics Engine, Rules Engine, AI Service (M3, M4, M6/M7 — not yet built)

- **Metrics Engine** (`metrics/engine.ts`): `computeDailyMetrics(storeId, date)` reads that day's (plus prior day/week/month for comparisons) `Order`/`OrderItem`/`Refund`/`DiscountUsage`/`Customer` rows, delegates to per-domain modules, upserts `DailyMetric` + `ProductDailyMetric`. Called nightly by the worker (with a backfill mode for historical import) and incrementally from webhook handlers.
- **Rules Engine** (`rules/engine.ts`): `evaluateRules(storeId, date)` — pure, deterministic, reads only `DailyMetric`/`ProductDailyMetric`/`RuleThreshold`, never raw orders, never calls AI. Runs immediately after metrics in the worker's `alertDetection.ts`.
- **AI Service** (`ai/`): `contextBuilder.ts` assembles one structured JSON object (metrics rollup, top/bottom products, in-period alerts, prior-period comparison — counts only, no customer PII) for `reportGenerator.ts` (weekly cron via Claude Sonnet 5, fixed JSON output shape) and `chatService.ts` (per-message: always includes latest `DailyMetric`/`OPEN Alert`/latest `Report` summary, plus a lightweight intent check to pull extra slices, plus last ~6 messages of the session for continuity).

Flow: `Shopify → sync/webhooks → raw tables → Metrics Engine → Rules Engine → Alert → AI Report Generator (reads DailyMetric+Alert only) → Report → frontend reads`.

## Build milestones

1. **M1 — Scaffold + credentials + manual import — DONE.** Monorepo, schema + migration, `/settings` connect flow with token encryption/validation, `runHistoricalImport.ts` CLI (REST pagination, see deviation note above), login/session auth, Dashboard/Products/Inventory pages reading real synced data. Verified: Prisma client generates cleanly, all packages type-check, `next build` compiles and produces all routes.
2. **M2 — Webhooks + reconciliation**: webhook registration on connect, receiver + handlers, HMAC verification, `WebhookEvent` idempotency, worker `syncReconciliation.ts`. *Demo*: create a test order in Shopify Admin, see it land in Postgres within seconds; simulate a missed webhook and confirm reconciliation catches it.
3. **M3 — Metrics Engine**: all metrics submodules, `dailyMetrics.ts` with backfill mode, `GET /api/metrics/revenue|orders`. *Demo*: numbers match Shopify Admin's own analytics for a known date.
4. **M4 — Rules Engine + Alerts**: seeded `RuleThreshold` defaults, rules engine, `alertDetection.ts` chained after metrics, `GET /api/alerts`. *Demo*: feed a synthetic revenue drop, see the correct `Alert` appear.
5. **M5 — Dashboard + core UI**: fill in reports(empty)/insights with real data, no AI yet. *Demo*: fully navigable app on live store data.
6. **M6 — AI weekly report**: Anthropic integration, `contextBuilder`, `reportGenerator`, `weeklyReport.ts` cron, Reports UI. *Demo*: trigger manually, view a generated report with all required sections.
7. **M7 — AI chat**: session/message/history routes, `chatService`, rate limiting, chat UI. *Demo*: ask "why did revenue drop last week" and get an answer matching dashboard numbers.
8. **M8 — Hardening (stretch)**: Docker Compose for local dev parity, unit tests for metrics/rules pure functions, basic error monitoring, production deploy to Vercel (web) + chosen worker host.

## Verification

- **Local dev**: `npm run dev:web` + `npm run dev:worker`; `npm run prisma:studio` to inspect synced/computed rows after each milestone.
- **Correctness checks**: cross-check `DailyMetric` output against Shopify Admin's built-in analytics for the same date range (M3); manually create/cancel/refund a test order in Shopify Admin and confirm the webhook → DB → metrics → alerts chain reacts correctly (M2–M4).
- **AI checks**: manually trigger `weeklyReport.ts` and `chatService` and confirm responses are grounded only in that store's real numbers (M6–M7) — no hallucinated figures, no PII leakage into `contextUsed`.
- **Security checks**: confirm the Shopify token is never returned by any API response (`GET /shopify/status` returns only metadata) — verified; confirm webhook HMAC rejection on a tampered payload (M2); confirm session cookie is httpOnly/secure — implemented.
