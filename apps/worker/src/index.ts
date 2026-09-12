import "dotenv/config";
import { logger } from "@repo/core";

// Placeholder entry point for the always-on worker process.
// Scheduled jobs (syncReconciliation, dailyMetrics, weeklyReport,
// alertDetection) are registered here with node-cron starting at M2/M3 —
// not needed yet for M1 (manual historical import only, via
// runHistoricalImport.ts).
logger.info("Worker process started (no scheduled jobs registered yet)");
