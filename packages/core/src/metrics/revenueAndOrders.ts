import { prisma } from "@repo/db";

export interface OrderRevenueMetrics {
  grossRevenue: number;
  totalDiscounts: number;
  orderCount: number;
  unitsSold: number;
  aov: number;
}

// Bucketed by Order.processedAt -- "orders placed on this day," regardless
// of whether they were later cancelled/refunded (that's tracked separately
// in computeRefundCancellationMetrics, bucketed by its own event date).
// grossRevenue uses subtotalPrice (product revenue before tax, after
// line-item discounts) as the top-line figure; netRevenue is derived in
// engine.ts by subtracting discounts and refunds.
export async function computeOrderRevenueMetrics(storeId: string, start: Date, end: Date): Promise<OrderRevenueMetrics> {
  const orders = await prisma.order.findMany({
    where: { storeId, processedAt: { gte: start, lt: end } },
    select: { subtotalPrice: true, totalDiscounts: true, items: { select: { quantity: true } } },
  });

  const grossRevenue = orders.reduce((sum, o) => sum + Number(o.subtotalPrice), 0);
  const totalDiscounts = orders.reduce((sum, o) => sum + Number(o.totalDiscounts), 0);
  const unitsSold = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
  const orderCount = orders.length;
  const aov = orderCount > 0 ? grossRevenue / orderCount : 0;

  return { grossRevenue, totalDiscounts, orderCount, unitsSold, aov };
}
