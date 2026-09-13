import { prisma, Prisma, Alert } from "@repo/db";
import { getUtcDayRange, addDays } from "../metrics/dateUtils";
import { compareToThreshold } from "./definitions";

type ThresholdMap = Map<string, { thresholdValue: number; comparisonOperator: string; isEnabled: boolean }>;

// Creates or refreshes an OPEN alert for (storeId, ruleKey, entityId) if the
// condition holds; otherwise resolves any existing OPEN alert for it. This
// keeps "Things That Need Attention" reflecting current state rather than
// accumulating stale alerts once the underlying issue is gone.
async function upsertOrResolveAlert(
  storeId: string,
  ruleKey: string,
  entityType: "STORE" | "PRODUCT",
  entityId: string | null,
  triggered: boolean,
  severity: "LOW" | "MEDIUM" | "HIGH",
  message: string,
  metricSnapshot: Prisma.InputJsonValue,
): Promise<Alert | null> {
  const existing = await prisma.alert.findFirst({
    where: { storeId, ruleKey, entityId, status: "OPEN" },
  });

  if (!triggered) {
    if (existing) {
      await prisma.alert.update({ where: { id: existing.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    }
    return null;
  }

  if (existing) {
    return prisma.alert.update({
      where: { id: existing.id },
      data: { severity, message, metricSnapshot, triggeredAt: new Date() },
    });
  }

  return prisma.alert.create({
    data: { storeId, ruleKey, severity, entityType, entityId, message, metricSnapshot, status: "OPEN" },
  });
}

// Pure and deterministic: reads only DailyMetric/ProductDailyMetric/
// RuleThreshold -- never raw orders, never calls the AI layer. Must run
// after computeDailyMetrics for the same date has already populated those
// tables.
export async function evaluateRules(storeId: string, date: Date): Promise<Alert[]> {
  const { start } = getUtcDayRange(date);
  const previousStart = addDays(start, -1);

  const [thresholdRows, todayMetric, yesterdayMetric, productMetrics] = await Promise.all([
    prisma.ruleThreshold.findMany({ where: { storeId } }),
    prisma.dailyMetric.findUnique({ where: { storeId_date: { storeId, date: start } } }),
    prisma.dailyMetric.findUnique({ where: { storeId_date: { storeId, date: previousStart } } }),
    prisma.productDailyMetric.findMany({
      where: { storeId, date: start },
      include: { product: { select: { title: true } } },
    }),
  ]);

  const thresholds: ThresholdMap = new Map(thresholdRows.map((t) => [t.ruleKey, t]));
  const results: Alert[] = [];

  const pushIfNotNull = (a: Alert | null) => {
    if (a) results.push(a);
  };

  // --- Store-level rules ---
  if (todayMetric) {
    const revenueRule = thresholds.get("REVENUE_DROP");
    if (revenueRule?.isEnabled && yesterdayMetric && Number(yesterdayMetric.grossRevenue) > 0) {
      const change = ((Number(todayMetric.grossRevenue) - Number(yesterdayMetric.grossRevenue)) / Number(yesterdayMetric.grossRevenue)) * 100;
      const triggered = compareToThreshold(change, revenueRule.comparisonOperator, revenueRule.thresholdValue);
      pushIfNotNull(
        await upsertOrResolveAlert(
          storeId,
          "REVENUE_DROP",
          "STORE",
          null,
          triggered,
          Math.abs(change) >= 30 ? "HIGH" : "MEDIUM",
          `Revenue ${change < 0 ? "decreased" : "increased"} ${Math.abs(change).toFixed(1)}% vs previous day.`,
          { changePct: change, today: Number(todayMetric.grossRevenue), yesterday: Number(yesterdayMetric.grossRevenue) },
        ),
      );
    }

    const refundRule = thresholds.get("REFUND_INCREASE");
    if (refundRule?.isEnabled && yesterdayMetric) {
      const refundRate = (metric: { grossRevenue: unknown; totalRefunds: unknown }) =>
        Number(metric.grossRevenue) > 0 ? (Number(metric.totalRefunds) / Number(metric.grossRevenue)) * 100 : 0;
      const todayRate = refundRate(todayMetric);
      const yesterdayRate = refundRate(yesterdayMetric);
      const change = todayRate - yesterdayRate;
      const triggered = compareToThreshold(change, refundRule.comparisonOperator, refundRule.thresholdValue);
      pushIfNotNull(
        await upsertOrResolveAlert(
          storeId,
          "REFUND_INCREASE",
          "STORE",
          null,
          triggered,
          "HIGH",
          `Refund rate increased ${change.toFixed(1)} percentage points vs previous day (${todayRate.toFixed(1)}% today).`,
          { changePoints: change, todayRatePct: todayRate, yesterdayRatePct: yesterdayRate },
        ),
      );
    }
  }

  // --- Per-product rules ---
  const stockoutRule = thresholds.get("STOCKOUT_RISK");
  const fastMovingRule = thresholds.get("FAST_MOVING_PRODUCT");
  const slowMovingRule = thresholds.get("SLOW_MOVING_PRODUCT");

  for (const pm of productMetrics) {
    if (stockoutRule?.isEnabled && pm.daysOfCoverage !== null) {
      const days = Number(pm.daysOfCoverage);
      const triggered = compareToThreshold(days, stockoutRule.comparisonOperator, stockoutRule.thresholdValue);
      pushIfNotNull(
        await upsertOrResolveAlert(
          storeId,
          "STOCKOUT_RISK",
          "PRODUCT",
          pm.productId,
          triggered,
          days <= 3 ? "HIGH" : "MEDIUM",
          `${pm.product.title} may stock out in ${Math.max(0, Math.round(days))} days at current sales velocity.`,
          { daysOfCoverage: days, velocity: pm.velocity !== null ? Number(pm.velocity) : null },
        ),
      );
    }

    if (fastMovingRule?.isEnabled && pm.growthPct !== null) {
      const growth = Number(pm.growthPct);
      const triggered = compareToThreshold(growth, fastMovingRule.comparisonOperator, fastMovingRule.thresholdValue);
      pushIfNotNull(
        await upsertOrResolveAlert(
          storeId,
          "FAST_MOVING_PRODUCT",
          "PRODUCT",
          pm.productId,
          triggered,
          "LOW",
          `${pm.product.title} sales grew ${growth.toFixed(0)}% vs previous day -- consider promoting further.`,
          { growthPct: growth, revenue: Number(pm.revenue) },
        ),
      );
    }

    if (slowMovingRule?.isEnabled && pm.velocity !== null) {
      const velocity = Number(pm.velocity);
      const triggered = compareToThreshold(velocity, slowMovingRule.comparisonOperator, slowMovingRule.thresholdValue);
      pushIfNotNull(
        await upsertOrResolveAlert(
          storeId,
          "SLOW_MOVING_PRODUCT",
          "PRODUCT",
          pm.productId,
          triggered,
          "LOW",
          `${pm.product.title} is selling slowly (${velocity.toFixed(2)} units/day, 7-day average).`,
          { velocity },
        ),
      );
    }
  }

  return results;
}
