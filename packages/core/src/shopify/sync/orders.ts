import { prisma } from "@repo/db";
import { ShopifyAdminClient } from "../adminClient";
import { upsertCustomer } from "./customers";

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  total_discount: string;
  product_id: number | null;
  variant_id: number | null;
}

export interface ShopifyRefundTransaction {
  kind: string;
  status: string;
  amount: string;
}

export interface ShopifyRefund {
  id: number;
  order_id?: number;
  created_at: string;
  note: string | null;
  transactions: ShopifyRefundTransaction[];
}

export interface ShopifyDiscountCode {
  code: string;
  amount: string;
  type: string;
}

// Not the same export as customers.ts's ShopifyCustomer -- kept local since
// it's only used for the embedded customer object inside an order payload.
interface ShopifyOrderCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  customer: ShopifyOrderCustomer | null;
  currency: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  total_price: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  processed_at: string;
  created_at: string;
  line_items: ShopifyLineItem[];
  refunds: ShopifyRefund[];
  discount_codes: ShopifyDiscountCode[];
}

export function refundAmount(refund: ShopifyRefund): number {
  return refund.transactions
    .filter((t) => t.kind === "refund" && t.status === "success")
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

async function fetchAndUpsertOrders(storeId: string, client: ShopifyAdminClient, params: URLSearchParams): Promise<number> {
  let url: string | null = client.restUrl(`/orders.json?${params.toString()}`);
  let processed = 0;

  while (url) {
    const currentUrl: string = url;
    const { body, nextUrl } = await client.restPage<{ orders: ShopifyOrder[] }>(currentUrl);

    for (const o of body.orders) {
      await upsertOrder(storeId, o);
      processed += 1;
    }

    url = nextUrl;
  }

  return processed;
}

// Syncs orders created on/after `sinceIso`. Used for the one-time
// historical backfill. `status=any` is required to pick up cancelled
// orders, which Shopify excludes from the default order listing.
export async function syncOrders(storeId: string, client: ShopifyAdminClient, sinceIso: string): Promise<number> {
  return fetchAndUpsertOrders(storeId, client, new URLSearchParams({ status: "any", limit: "250", created_at_min: sinceIso }));
}

// Syncs orders *updated* on/after `sinceIso` -- used by reconciliation to
// catch edits to older orders (a refund on a week-old order, a status
// change) that created_at_min-based filtering would miss.
export async function syncRecentlyUpdatedOrders(storeId: string, client: ShopifyAdminClient, sinceIso: string): Promise<number> {
  return fetchAndUpsertOrders(storeId, client, new URLSearchParams({ status: "any", limit: "250", updated_at_min: sinceIso }));
}

// Exported for reuse by the orders/create|updated|paid|cancelled webhook
// handlers, which receive the same full order JSON shape as the REST API.
export async function upsertOrder(storeId: string, o: ShopifyOrder): Promise<void> {
  let customerId: string | null = null;
  if (o.customer) {
    const customer = await upsertCustomer(storeId, o.customer);
    customerId = customer.id;
  }

  const totalRefunded = o.refunds.reduce((sum, r) => sum + refundAmount(r), 0);

  const order = await prisma.order.upsert({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId: BigInt(o.id) } },
    update: {
      customerId,
      currency: o.currency,
      subtotalPrice: o.subtotal_price,
      totalDiscounts: o.total_discounts,
      totalTax: o.total_tax,
      totalPrice: o.total_price,
      totalRefunded,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status,
      cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
    },
    create: {
      storeId,
      shopifyOrderId: BigInt(o.id),
      orderNumber: o.order_number,
      customerId,
      currency: o.currency,
      subtotalPrice: o.subtotal_price,
      totalDiscounts: o.total_discounts,
      totalTax: o.total_tax,
      totalPrice: o.total_price,
      totalRefunded,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status,
      cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
      processedAt: new Date(o.processed_at ?? o.created_at),
    },
  });

  await syncLineItems(storeId, order.id, o.line_items);
  await syncRefunds(storeId, order.id, o.refunds);
  await syncDiscountUsages(storeId, order.id, o.discount_codes);
}

async function syncLineItems(storeId: string, orderId: string, items: ShopifyLineItem[]): Promise<void> {
  // Line items don't carry a stable primary key we upsert against elsewhere
  // in this schema (no unique constraint on shopifyLineItemId), so re-import
  // idempotently by clearing and re-inserting for this order.
  await prisma.orderItem.deleteMany({ where: { orderId } });

  for (const item of items) {
    const product = item.product_id
      ? await prisma.product.findFirst({ where: { storeId, shopifyProductId: BigInt(item.product_id) }, select: { id: true } })
      : null;
    const variant = item.variant_id
      ? await prisma.productVariant.findFirst({ where: { storeId, shopifyVariantId: BigInt(item.variant_id) }, select: { id: true } })
      : null;

    await prisma.orderItem.create({
      data: {
        storeId,
        orderId,
        productId: product?.id,
        variantId: variant?.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        totalDiscount: item.total_discount,
      },
    });
  }
}

// Handles the refunds/create webhook, whose payload is a standalone refund
// object (order_id field, not nested inside an order) rather than the full
// order shape upsertOrder expects. If the parent order hasn't been synced
// yet (e.g. webhook arrived out of order), this is a no-op — the periodic
// reconciliation job will pick it up on the next pass.
export async function applyRefundWebhook(storeId: string, refund: ShopifyRefund): Promise<void> {
  if (!refund.order_id) return;

  const order = await prisma.order.findFirst({
    where: { storeId, shopifyOrderId: BigInt(refund.order_id) },
    select: { id: true },
  });
  if (!order) return;

  const amount = refundAmount(refund);
  if (amount > 0) {
    await prisma.refund.upsert({
      where: { storeId_shopifyRefundId: { storeId, shopifyRefundId: BigInt(refund.id) } },
      update: { amount, reason: refund.note },
      create: {
        storeId,
        orderId: order.id,
        shopifyRefundId: BigInt(refund.id),
        amount,
        reason: refund.note,
        createdAt: new Date(refund.created_at),
      },
    });
  }

  const allRefunds = await prisma.refund.findMany({ where: { orderId: order.id }, select: { amount: true } });
  const totalRefunded = allRefunds.reduce((sum, r) => sum + Number(r.amount), 0);
  await prisma.order.update({ where: { id: order.id }, data: { totalRefunded } });
}

async function syncRefunds(storeId: string, orderId: string, refunds: ShopifyRefund[]): Promise<void> {
  for (const r of refunds) {
    const amount = refundAmount(r);
    if (amount === 0) continue;
    await prisma.refund.upsert({
      where: { storeId_shopifyRefundId: { storeId, shopifyRefundId: BigInt(r.id) } },
      update: { amount, reason: r.note },
      create: { storeId, orderId, shopifyRefundId: BigInt(r.id), amount, reason: r.note, createdAt: new Date(r.created_at) },
    });
  }
}

async function syncDiscountUsages(storeId: string, orderId: string, codes: ShopifyDiscountCode[]): Promise<void> {
  await prisma.discountUsage.deleteMany({ where: { orderId } });
  for (const d of codes) {
    await prisma.discountUsage.create({
      data: { storeId, orderId, code: d.code, type: d.type, amountDeducted: d.amount },
    });
  }
}
