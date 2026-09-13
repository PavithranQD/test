import { ShopifyAdminClient } from "../adminClient";

// Every topic the app needs to stay in sync. `app/uninstalled` lets us mark
// the store inactive immediately rather than waiting for a failed API call
// to reveal the token was revoked.
const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "orders/paid",
  "refunds/create",
  "products/create",
  "products/update",
  "inventory_levels/update",
  "customers/create",
  "customers/update",
  "app/uninstalled",
] as const;

interface ExistingWebhook {
  id: number;
  topic: string;
  address: string;
}

// Idempotent: safe to call every time a store is (re)connected. Skips
// topics that already have a subscription pointed at this exact address,
// so reconnecting with the same APP_BASE_URL doesn't create duplicates.
export async function registerWebhooks(client: ShopifyAdminClient, appBaseUrl: string): Promise<void> {
  const { webhooks: existing } = await client.rest<{ webhooks: ExistingWebhook[] }>("/webhooks.json?limit=250");

  for (const topic of WEBHOOK_TOPICS) {
    const address = `${appBaseUrl}/api/shopify/webhooks/${topic.replace("/", "-")}`;
    const alreadyRegistered = existing.some((w) => w.topic === topic && w.address === address);
    if (alreadyRegistered) continue;

    await client.rest("/webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: { topic, address, format: "json" },
      }),
    });
  }
}
