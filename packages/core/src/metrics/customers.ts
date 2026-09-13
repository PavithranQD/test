import { prisma } from "@repo/db";

export interface CustomerMetrics {
  newCustomers: number;
  returningCustomers: number;
  repeatPurchaseRate: number;
}

// "New" = this is the first day this customer has ever ordered (no order
// with an earlier processedAt). "Returning" = they ordered before `start`
// too. repeatPurchaseRate = returning / total ordering customers that day.
export async function computeCustomerMetrics(storeId: string, start: Date, end: Date): Promise<CustomerMetrics> {
  const ordersToday = await prisma.order.findMany({
    where: { storeId, processedAt: { gte: start, lt: end }, customerId: { not: null } },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const customerIds = ordersToday.map((o) => o.customerId).filter((id): id is string => id !== null);

  if (customerIds.length === 0) {
    return { newCustomers: 0, returningCustomers: 0, repeatPurchaseRate: 0 };
  }

  const priorOrders = await prisma.order.findMany({
    where: { storeId, customerId: { in: customerIds }, processedAt: { lt: start } },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const returningSet = new Set(priorOrders.map((o) => o.customerId));

  const returningCustomers = customerIds.filter((id) => returningSet.has(id)).length;
  const newCustomers = customerIds.length - returningCustomers;
  const repeatPurchaseRate = (returningCustomers / customerIds.length) * 100;

  return { newCustomers, returningCustomers, repeatPurchaseRate };
}
