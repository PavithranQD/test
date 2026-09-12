import { NextRequest, NextResponse } from "next/server";
import { connectStore, ShopifyApiError } from "@repo/core";
import { requireUser } from "../../../../lib/session";

export async function POST(request: NextRequest) {
  await requireUser();

  const { shopDomain, accessToken, apiKey, apiSecret } = await request.json();
  if (!shopDomain || !accessToken || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  try {
    const store = await connectStore({
      shopDomain,
      accessToken,
      apiKey,
      apiSecret,
      scopes: "read_products,read_orders,read_customers,read_inventory,read_discounts",
    });
    return NextResponse.json({ ok: true, shopDomain: store.shopDomain, name: store.name });
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      return NextResponse.json(
        { error: "Could not validate credentials against Shopify. Check the domain and token." },
        { status: 400 },
      );
    }
    throw err;
  }
}
