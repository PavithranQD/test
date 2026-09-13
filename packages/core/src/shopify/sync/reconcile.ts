import { prisma } from "@repo/db";
import { getAdminClientForStore } from "../connectStore";
import { syncRecentlyUpdatedProducts } from "./products";
import { syncRecentlyUpdatedOrders } from "./orders";

const DEFAULT_LOOKBACK_HOURS = 24;

// Backstop for missed/failed webhooks, which Shopify does not guarantee
// delivery of. Re-pulls anything updated in the last `lookbackHours` --
// wider than the cron interval so a single missed run doesn't create a
// permanent gap. Safe to call as often as needed; everything upserts.
export async function reconcileStore(storeId: string, lookbackHours = DEFAULT_LOOKBACK_HOURS): Promise<void> {
  const { client } = await getAdminClientForStore(storeId);
  const sinceIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const job = await prisma.syncJob.create({
    data: { storeId, jobType: "RECONCILIATION", entity: "orders+products", status: "RUNNING", startedAt: new Date() },
  });

  try {
    const productsProcessed = await syncRecentlyUpdatedProducts(storeId, client, sinceIso);
    const ordersProcessed = await syncRecentlyUpdatedOrders(storeId, client, sinceIso);

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", recordsProcessed: productsProcessed + ordersProcessed, finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

// Runs reconciliation for every currently-connected store. Phase 1 has
// exactly one, but this loop costs nothing and removes a rewrite later.
export async function reconcileAllActiveStores(): Promise<void> {
  const stores = await prisma.store.findMany({ where: { isActive: true } });
  for (const store of stores) {
    await reconcileStore(store.id);
  }
}
