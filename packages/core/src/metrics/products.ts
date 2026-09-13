import { prisma } from "@repo/db";
import { addDays } from "./dateUtils";

const VELOCITY_WINDOW_DAYS = 7;

// Computes and upserts one ProductDailyMetric row per product that had
// sales on `start`'s day. growthPct compares today's revenue to
// yesterday's ProductDailyMetric row (day-over-day). velocity/
// daysOfCoverage use current InventoryLevel as a snapshot -- there's no
// historical inventory table in Phase 1 (see PLAN.md), so for backfilled
// past dates these two fields reflect *today's* stock, not the stock as of
// that historical date. That's a known approximation, acceptable because
// the numbers that matter operationally (current stockout risk) are always
// computed against "today" anyway.
export async function computeProductDailyMetrics(storeId: string, start: Date, end: Date): Promise<void> {
  const items = await prisma.orderItem.findMany({
    where: { storeId, productId: { not: null }, order: { processedAt: { gte: start, lt: end } } },
    select: { productId: true, quantity: true, price: true },
  });

  const byProduct = new Map<string, { unitsSold: number; revenue: number }>();
  for (const item of items) {
    if (!item.productId) continue;
    const entry = byProduct.get(item.productId) ?? { unitsSold: 0, revenue: 0 };
    entry.unitsSold += item.quantity;
    entry.revenue += Number(item.price) * item.quantity;
    byProduct.set(item.productId, entry);
  }

  const trailingStart = addDays(start, -(VELOCITY_WINDOW_DAYS - 1));

  for (const [productId, { unitsSold, revenue }] of byProduct) {
    const prevDay = await prisma.productDailyMetric.findUnique({
      where: { storeId_productId_date: { storeId, productId, date: addDays(start, -1) } },
      select: { revenue: true },
    });
    const prevRevenue = prevDay ? Number(prevDay.revenue) : null;
    const growthPct = prevRevenue !== null && prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

    const trailingAgg = await prisma.orderItem.aggregate({
      where: { storeId, productId, order: { processedAt: { gte: trailingStart, lt: end } } },
      _sum: { quantity: true },
    });
    const velocity = (trailingAgg._sum.quantity ?? 0) / VELOCITY_WINDOW_DAYS;

    const inventoryAgg = await prisma.inventoryLevel.aggregate({
      where: { storeId, variant: { productId } },
      _sum: { available: true },
    });
    const availableUnits = inventoryAgg._sum.available ?? 0;
    const daysOfCoverage = velocity > 0 ? availableUnits / velocity : null;

    await prisma.productDailyMetric.upsert({
      where: { storeId_productId_date: { storeId, productId, date: start } },
      update: { unitsSold, revenue, growthPct, velocity, daysOfCoverage },
      create: { storeId, productId, date: start, unitsSold, revenue, growthPct, velocity, daysOfCoverage },
    });
  }
}
