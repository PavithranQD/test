import { reconcileAllActiveStores, logger } from "@repo/core";

export async function runSyncReconciliation(): Promise<void> {
  logger.info("Running sync reconciliation");
  try {
    await reconcileAllActiveStores();
    logger.info("Sync reconciliation complete");
  } catch (err) {
    logger.error(err, "Sync reconciliation failed");
  }
}
