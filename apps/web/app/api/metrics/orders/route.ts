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
      select: {
        date: true,
        orderCount: true,
        cancelledOrderCount: true,
        refundedOrderCount: true,
        aov: true,
        unitsSold: true,
      },
    }),
    getPeriodComparison(store.id, 1),
    getPeriodComparison(store.id, 7),
    getPeriodComparison(store.id, 30),
  ]);

  return NextResponse.json({ daily, dayOverDay, weekOverWeek, monthOverMonth });
}
