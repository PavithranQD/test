import { prisma } from "@repo/db";
import { evaluateRules, logger } from "@repo/core";

// Always run immediately after dailyMetrics -- the rules engine reads
// DailyMetric/ProductDailyMetric, which must already reflect the date
// being evaluated.
export async function runAlertDetection(date: Date = new Date()): Promise<void> {
  logger.info("Running alert detection");
  try {
    const stores = await prisma.store.findMany({ where: { isActive: true } });
    for (const store of stores) {
      await evaluateRules(store.id, date);
    }
    logger.info("Alert detection complete");
  } catch (err) {
    logger.error(err, "Alert detection failed");
  }
}
