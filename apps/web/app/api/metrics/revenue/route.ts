import { NextResponse } from "next/server";
import { prisma } from "@repo/db";
import { getActiveStore, getPeriodComparison } from "@repo/core";
import { requireUser } from "../../../../lib/session";

export async function GET() {
  await requireUser();

  const store = await getActiveStore();
  if (!store) {
    return NextResponse.json({ error: "No connected store" }, { status: 404 });
  }

  const [daily, dayOverDay, weekOverWeek, monthOverMonth] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: { storeId: store.id },
      orderBy: { date: "asc" },
      take: 90,
      select: { date: true, grossRevenue: true, netRevenue: true, totalDiscounts: true, totalRefunds: true },
    }),
    getPeriodComparison(store.id, 1),
    getPeriodComparison(store.id, 7),
    getPeriodComparison(store.id, 30),
  ]);

  return NextResponse.json({ daily, dayOverDay, weekOverWeek, monthOverMonth });
}
