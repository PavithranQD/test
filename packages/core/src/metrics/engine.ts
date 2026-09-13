import { prisma } from "@repo/db";
import { getUtcDayRange, addDays } from "./dateUtils";
import { computeOrderRevenueMetrics } from "./revenueAndOrders";
import { computeRefundCancellationMetrics } from "./refundsAndCancellations";
import { computeCustomerMetrics } from "./customers";
import { computeProductDailyMetrics } from "./products";

// Computes and upserts the DailyMetric + ProductDailyMetric rows for one
// calendar day. Called nightly (for "yesterday") by the worker, once
// incrementally for "today" from webhook handlers, and in a loop by
// backfillDailyMetrics for historical dates.
export async function computeDailyMetrics(storeId: string, date: Date): Promise<void> {
  const { start, end } = getUtcDayRange(date);

  const [orderRevenue, refundCancellation, customerMetrics] = await Promise.all([
    computeOrderRevenueMetrics(storeId, start, end),
    computeRefundCancellationMetrics(storeId, start, end),
    computeCustomerMetrics(storeId, start, end),
  ]);

  const netRevenue = orderRevenue.grossRevenue - orderRevenue.totalDiscounts - refundCancellation.totalRefunds;

  await prisma.dailyMetric.upsert({
    where: { storeId_date: { storeId, date: start } },
    update: {
      grossRevenue: orderRevenue.grossRevenue,
      netRevenue,
      totalDiscounts: orderRevenue.totalDiscounts,
      totalRefunds: refundCancellation.totalRefunds,
      orderCount: orderRevenue.orderCount,
      cancelledOrderCount: refundCancellation.cancelledOrderCount,
      refundedOrderCount: refundCancellation.refundedOrderCount,
      aov: orderRevenue.aov,
      newCustomers: customerMetrics.newCustomers,
      returningCustomers: customerMetrics.returningCustomers,
      repeatPurchaseRate: customerMetrics.repeatPurchaseRate,
      unitsSold: orderRevenue.unitsSold,
      computedAt: new Date(),
    },
    create: {
      storeId,
      date: start,
      grossRevenue: orderRevenue.grossRevenue,
      netRevenue,
      totalDiscounts: orderRevenue.totalDiscounts,
      totalRefunds: refundCancellation.totalRefunds,
      orderCount: orderRevenue.orderCount,
      cancelledOrderCount: refundCancellation.cancelledOrderCount,
      refundedOrderCount: refundCancellation.refundedOrderCount,
      aov: orderRevenue.aov,
      newCustomers: customerMetrics.newCustomers,
      returningCustomers: customerMetrics.returningCustomers,
      repeatPurchaseRate: customerMetrics.repeatPurchaseRate,
      unitsSold: orderRevenue.unitsSold,
    },
  });

  await computeProductDailyMetrics(storeId, start, end);
}

// Runs computeDailyMetrics for every day in [fromDate, toDate], inclusive,
// in chronological order (required since growthPct looks at the previous
// day's already-computed row). Used once after the historical import to
// populate DailyMetric history, and available for manual re-backfills.
export async function backfillDailyMetrics(storeId: string, fromDate: Date, toDate: Date): Promise<number> {
  let cursor = getUtcDayRange(fromDate).start;
  const endDay = getUtcDayRange(toDate).start;
  let daysProcessed = 0;

  while (cursor <= endDay) {
    await computeDailyMetrics(storeId, cursor);
    daysProcessed += 1;
    cursor = addDays(cursor, 1);
  }

  return daysProcessed;
}
