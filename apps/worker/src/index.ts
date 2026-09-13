import path from "node:path";
import dotenv from "dotenv";
// See runHistoricalImport.ts for why this loads explicitly from the repo
// root instead of relying on dotenv's cwd-relative default.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import cron from "node-cron";
import { logger } from "@repo/core";
import { runSyncReconciliation } from "./jobs/syncReconciliation";

// Every 6 hours: backstop for webhooks Shopify failed to deliver. Wider
// than this interval would risk permanent gaps; more frequent adds load
// without much benefit since webhooks handle the real-time path.
cron.schedule("0 */6 * * *", runSyncReconciliation);

logger.info("Worker process started -- sync reconciliation scheduled every 6 hours");

// Also run once immediately on startup, so a deploy doesn't wait up to 6
// hours for the first reconciliation pass.
runSyncReconciliation();
