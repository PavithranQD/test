import { NextResponse } from "next/server";
import { getActiveStore } from "@repo/core";
import { requireUser } from "../../../../lib/session";

// Deliberately returns only non-secret metadata — never the access token or
// API secret, even to an authenticated request.
export async function GET() {
  await requireUser();

  const store = await getActiveStore();
  if (!store) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    shopDomain: store.shopDomain,
    name: store.name,
    currency: store.currency,
    timezone: store.timezone,
    scopes: store.scopes,
    connectedAt: store.connectedAt,
  });
}
