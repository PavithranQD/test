import { prisma } from "@repo/db";
import { getAdminClientForStore } from "../connectStore";
import { syncProducts } from "./products";
import { syncCustomers } from "./customers";
import { syncOrders } from "./orders";

const DEFAULT_HISTORY_MONTHS = 12;

async function runTrackedJob(storeId: string, entity: string, fn: () => Promise<number>): Promise<void> {
  const job = await prisma.syncJob.create({
    data: { storeId, jobType: "HISTORICAL_IMPORT", entity, status: "RUNNING", startedAt: new Date() },
  });

  try {
    const recordsProcessed = await fn();
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", recordsProcessed, finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    throw err;
  }
}

// Runs the initial backfill for a newly-connected store: products (with
// variants + inventory), customers, then orders (with line items, refunds,
// discount usage) for the trailing `historyMonths` months. Products and
// customers must be synced first so order line items / customer links can
// resolve to already-known rows.
export async function runHistoricalImport(storeId: string, historyMonths = DEFAULT_HISTORY_MONTHS): Promise<void> {
  const { client } = await getAdminClientForStore(storeId);

  await runTrackedJob(storeId, "products", () => syncProducts(storeId, client));
  await runTrackedJob(storeId, "customers", () => syncCustomers(storeId, client));

  const since = new Date();
  since.setMonth(since.getMonth() - historyMonths);
  await runTrackedJob(storeId, "orders", () => syncOrders(storeId, client, since.toISOString()));
}
