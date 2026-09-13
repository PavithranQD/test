import path from "node:path";
import dotenv from "dotenv";
// See runHistoricalImport.ts for why this loads explicitly from the repo
// root instead of relying on dotenv's cwd-relative default.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import cron from "node-cron";
import { logger } from "@repo/core";
import { runSyncReconciliation } from "./jobs/syncReconciliation";
import { runDailyMetrics } from "./jobs/dailyMetrics";

// Every 6 hours: backstop for webhooks Shopify failed to deliver. Wider
// than this interval would risk permanent gaps; more frequent adds load
// without much benefit since webhooks handle the real-time path.
cron.schedule("0 */6 * * *", runSyncReconciliation);

// Once daily, shortly after midnight UTC: finalizes yesterday's DailyMetric
// row. Runs after reconciliation would have had a chance to catch any late
// webhooks for that day.
cron.schedule("15 0 * * *", runDailyMetrics);

logger.info("Worker process started -- reconciliation every 6h, daily metrics at 00:15 UTC");

// Also run once immediately on startup, so a deploy doesn't wait for the
// next scheduled tick before the first pass.
runSyncReconciliation();
runDailyMetrics();
