import { prisma } from "@repo/db";

// The five rules from the spec, with the default threshold seeded per
// store on first connect (RuleThreshold rows are editable per store from
// there, per the spec's "thresholds should eventually be configurable"
// requirement).
export const RULE_DEFAULTS: {
  ruleKey: string;
  thresholdValue: number;
  comparisonOperator: "lte" | "gte";
  description: string;
}[] = [
  {
    ruleKey: "REVENUE_DROP",
    thresholdValue: -15,
    comparisonOperator: "lte",
    description: "Store-level gross revenue day-over-day change (%) at or below this triggers an alert.",
  },
  {
    ruleKey: "STOCKOUT_RISK",
    thresholdValue: 7,
    comparisonOperator: "lte",
    description: "Per-product estimated days of inventory coverage at or below this triggers an alert.",
  },
  {
    ruleKey: "FAST_MOVING_PRODUCT",
    thresholdValue: 30,
    comparisonOperator: "gte",
    description: "Per-product day-over-day revenue growth (%) at or above this triggers an alert.",
  },
  {
    ruleKey: "REFUND_INCREASE",
    thresholdValue: 20,
    comparisonOperator: "gte",
    description: "Store-level refund-rate day-over-day change (percentage points) at or above this triggers an alert.",
  },
  {
    ruleKey: "SLOW_MOVING_PRODUCT",
    thresholdValue: 0.3,
    comparisonOperator: "lte",
    description: "Per-product 7-day sales velocity (units/day) at or below this triggers an alert (only for products with any sales history).",
  },
];

export function compareToThreshold(value: number, operator: string, threshold: number): boolean {
  return operator === "lte" ? value <= threshold : value >= threshold;
}

// Called once when a store is connected. Idempotent -- won't overwrite
// thresholds a user has already customized on reconnect.
export async function seedDefaultRuleThresholds(storeId: string): Promise<void> {
  for (const rule of RULE_DEFAULTS) {
    await prisma.ruleThreshold.upsert({
      where: { storeId_ruleKey: { storeId, ruleKey: rule.ruleKey } },
      update: {},
      create: {
        storeId,
        ruleKey: rule.ruleKey,
        thresholdValue: rule.thresholdValue,
        comparisonOperator: rule.comparisonOperator,
      },
    });
  }
}
