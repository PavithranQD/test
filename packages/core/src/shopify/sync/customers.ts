import { prisma } from "@repo/db";
import { ShopifyAdminClient } from "../adminClient";

export interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
}

export async function syncCustomers(storeId: string, client: ShopifyAdminClient): Promise<number> {
  let url: string | null = client.restUrl("/customers.json?limit=250");
  let processed = 0;

  while (url) {
    const currentUrl: string = url;
    const { body, nextUrl } = await client.restPage<{ customers: ShopifyCustomer[] }>(currentUrl);

    for (const c of body.customers) {
      await upsertCustomer(storeId, c);
      processed += 1;
    }

    url = nextUrl;
  }

  return processed;
}

// Also called inline from order sync, since an order's embedded customer
// object may be the first time we see that customer (e.g. guest-checkout
// customers that were created after the last full /customers.json sync).
export async function upsertCustomer(storeId: string, c: ShopifyCustomer) {
  return prisma.customer.upsert({
    where: { storeId_shopifyCustomerId: { storeId, shopifyCustomerId: BigInt(c.id) } },
    update: {
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      ordersCount: c.orders_count,
      totalSpent: c.total_spent,
    },
    create: {
      storeId,
      shopifyCustomerId: BigInt(c.id),
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      ordersCount: c.orders_count,
      totalSpent: c.total_spent,
      firstOrderAt: c.created_at ? new Date(c.created_at) : null,
    },
  });
}
