import { prisma } from "@repo/db";
import { upsertOrder, applyRefundWebhook, ShopifyOrder, ShopifyRefund } from "../sync/orders";
import { upsertProduct, upsertInventoryLevel, ShopifyProduct } from "../sync/products";
import { upsertCustomer, ShopifyCustomer } from "../sync/customers";

type WebhookHandler = (storeId: string, payload: any) => Promise<void>;

// Keyed by the exact topic string Shopify sends in the X-Shopify-Topic
// header -- not by the URL path segment, which is only used for
// organization/debugging and isn't trusted for dispatch.
export const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  "orders/create": (storeId, payload: ShopifyOrder) => upsertOrder(storeId, payload),
  "orders/updated": (storeId, payload: ShopifyOrder) => upsertOrder(storeId, payload),
  "orders/cancelled": (storeId, payload: ShopifyOrder) => upsertOrder(storeId, payload),
  "orders/paid": (storeId, payload: ShopifyOrder) => upsertOrder(storeId, payload),
  "refunds/create": (storeId, payload: ShopifyRefund) => applyRefundWebhook(storeId, payload),
  "products/create": (storeId, payload: ShopifyProduct) => upsertProduct(storeId, payload),
  "products/update": (storeId, payload: ShopifyProduct) => upsertProduct(storeId, payload),
  "inventory_levels/update": (storeId, payload) =>
    upsertInventoryLevel(storeId, {
      inventory_item_id: payload.inventory_item_id,
      location_id: payload.location_id,
      available: payload.available,
    }),
  "customers/create": (storeId, payload: ShopifyCustomer) => upsertCustomer(storeId, payload).then(() => undefined),
  "customers/update": (storeId, payload: ShopifyCustomer) => upsertCustomer(storeId, payload).then(() => undefined),
  "app/uninstalled": async (storeId) => {
    await prisma.store.update({ where: { id: storeId }, data: { isActive: false } });
  },
};
