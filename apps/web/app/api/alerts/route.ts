import { NextResponse } from "next/server";
import { prisma } from "@repo/db";
import { getActiveStore } from "@repo/core";
import { requireUser } from "../../../lib/session";

export async function GET() {
  await requireUser();

  const store = await getActiveStore();
  if (!store) {
    return NextResponse.json({ error: "No connected store" }, { status: 404 });
  }

  const alerts = await prisma.alert.findMany({
    where: { storeId: store.id, status: "OPEN" },
    orderBy: { triggeredAt: "desc" },
    take: 100,
  });

  // Prisma can't order by an arbitrary severity priority in one query
  // (alphabetical would put HIGH before LOW before MEDIUM) -- sort in JS.
  const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99));

  return NextResponse.json({ alerts });
}
