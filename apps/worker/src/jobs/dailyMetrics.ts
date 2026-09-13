import { prisma } from "@repo/db";
import { computeDailyMetrics, logger } from "@repo/core";

// Runs shortly after midnight UTC for "yesterday" (the last day guaranteed
// to be fully complete). Today's metrics stay fresh via the incremental
// recompute triggered from webhook handlers instead.
export async function runDailyMetrics(): Promise<void> {
  logger.info("Computing daily metrics");
  try {
    const stores = await prisma.store.findMany({ where: { isActive: true } });
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    for (const store of stores) {
      await computeDailyMetrics(store.id, yesterday);
    }
    logger.info("Daily metrics computation complete");
  } catch (err) {
    logger.error(err, "Daily metrics computation failed");
  }
}
