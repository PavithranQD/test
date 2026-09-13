import { prisma } from "@repo/db";

export interface RefundCancellationMetrics {
  totalRefunds: number;
  refundedOrderCount: number;
  cancelledOrderCount: number;
}

// Bucketed by the event's own date (Refund.createdAt / Order.cancelledAt),
// not the original order's processedAt -- a refund issued today on a
// week-old order counts as today's refund activity, matching how the spec's
// "Refund Rate ... up 18%" reads as a period-over-period activity metric.
export async function computeRefundCancellationMetrics(storeId: string, start: Date, end: Date): Promise<RefundCancellationMetrics> {
  const refunds = await prisma.refund.findMany({
    where: { storeId, createdAt: { gte: start, lt: end } },
    select: { amount: true, orderId: true },
  });

  const totalRefunds = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  const refundedOrderCount = new Set(refunds.map((r) => r.orderId)).size;

  const cancelledOrderCount = await prisma.order.count({
    where: { storeId, cancelledAt: { gte: start, lt: end } },
  });

  return { totalRefunds, refundedOrderCount, cancelledOrderCount };
}
