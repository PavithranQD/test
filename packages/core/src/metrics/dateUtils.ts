// Phase 1 buckets daily metrics by UTC calendar day, not the store's local
// timezone. Store.timezone is captured for future use, but implementing
// true timezone-aware day boundaries is deferred -- flagged in PLAN.md as a
// known simplification, revisit if a store near a timezone boundary needs
// more precise "today" reporting.
export function getUtcDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
