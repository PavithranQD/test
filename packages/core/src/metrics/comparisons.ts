import { prisma } from "@repo/db";
import { getUtcDayRange, addDays } from "./dateUtils";

export interface PeriodSummary {
  grossRevenue: number;
  netRevenue: number;
  totalDiscounts: number;
  totalRefunds: number;
  orderCount: number;
  cancelledOrderCount: number;
  refundedOrderCount: number;
  aov: number;
  newCustomers: number;
  returningCustomers: number;
  unitsSold: number;
  refundRate: number;
}

export interface PeriodComparison {
  windowDays: number;
  current: PeriodSummary;
  previous: PeriodSummary;
  changePct: Record<keyof PeriodSummary, number>;
}

function sumPeriod(rows: { grossRevenue: unknown; netRevenue: unknown; totalDiscounts: unknown; totalRefunds: unknown; orderCount: number; cancelledOrderCount: number; refundedOrderCount: number; newCustomers: number; returningCustomers: number; unitsSold: number }[]): PeriodSummary {
  const grossRevenue = rows.reduce((s, r) => s + Number(r.grossRevenue), 0);
  const netRevenue = rows.reduce((s, r) => s + Number(r.netRevenue), 0);
  const totalDiscounts = rows.reduce((s, r) => s + Number(r.totalDiscounts), 0);
  const totalRefunds = rows.reduce((s, r) => s + Number(r.totalRefunds), 0);
  const orderCount = rows.reduce((s, r) => s + r.orderCount, 0);
  const cancelledOrderCount = rows.reduce((s, r) => s + r.cancelledOrderCount, 0);
  const refundedOrderCount = rows.reduce((s, r) => s + r.refundedOrderCount, 0);
  const newCustomers = rows.reduce((s, r) => s + r.newCustomers, 0);
  const returningCustomers = rows.reduce((s, r) => s + r.returningCustomers, 0);
  const unitsSold = rows.reduce((s, r) => s + r.unitsSold, 0);

  return {
    grossRevenue,
    netRevenue,
    totalDiscounts,
    totalRefunds,
    orderCount,
    cancelledOrderCount,
    refundedOrderCount,
    aov: orderCount > 0 ? grossRevenue / orderCount : 0,
    newCustomers,
    returningCustomers,
    unitsSold,
    refundRate: grossRevenue > 0 ? (totalRefunds / grossRevenue) * 100 : 0,
  };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

// Compares the trailing `windowDays` (including today) against the
// `windowDays` before that -- e.g. windowDays=1 is today vs yesterday,
// windowDays=7 is this week vs last week, windowDays=30 is month vs month.
// This is a rolling window, not calendar-aligned (ISO week/month) -- a
// deliberate simplification consistent with computeDailyMetrics' UTC-day
// bucketing.
export async function getPeriodComparison(storeId: string, windowDays: number): Promise<PeriodComparison> {
  const today = getUtcDayRange(new Date()).start;
  const currentStart = addDays(today, -(windowDays - 1));
  const previousStart = addDays(currentStart, -windowDays);
  const currentEnd = addDays(today, 1);

  const [currentRows, previousRows] = await Promise.all([
    prisma.dailyMetric.findMany({ where: { storeId, date: { gte: currentStart, lt: currentEnd } } }),
    prisma.dailyMetric.findMany({ where: { storeId, date: { gte: previousStart, lt: currentStart } } }),
  ]);

  const current = sumPeriod(currentRows);
  const previous = sumPeriod(previousRows);

  const changePct = Object.fromEntries(
    (Object.keys(current) as (keyof PeriodSummary)[]).map((key) => [key, pctChange(current[key], previous[key])]),
  ) as Record<keyof PeriodSummary, number>;

  return { windowDays, current, previous, changePct };
}
