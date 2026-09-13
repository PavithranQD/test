import { NextRequest, NextResponse } from "next/server";
import { connectStore, registerWebhooks, seedDefaultRuleThresholds, ShopifyAdminClient, ShopifyApiError, logger } from "@repo/core";
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

    await seedDefaultRuleThresholds(store.id);

    const appBaseUrl = process.env.APP_BASE_URL;
    if (appBaseUrl) {
      const client = new ShopifyAdminClient({ shopDomain: store.shopDomain, accessToken });
      await registerWebhooks(client, appBaseUrl);
    } else {
      logger.warn("APP_BASE_URL not set -- skipped webhook registration. Continuous sync will rely on reconciliation only.");
    }

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
