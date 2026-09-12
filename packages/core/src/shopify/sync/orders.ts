import { prisma } from "@repo/db";
import { ShopifyAdminClient } from "../adminClient";
import { upsertCustomer } from "./customers";

interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  total_discount: string;
  product_id: number | null;
  variant_id: number | null;
}

interface ShopifyRefundTransaction {
  kind: string;
  status: string;
  amount: string;
}

interface ShopifyRefund {
  id: number;
  created_at: string;
  note: string | null;
  transactions: ShopifyRefundTransaction[];
}

interface ShopifyDiscountCode {
  code: string;
  amount: string;
  type: string;
}

interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
}

interface ShopifyOrder {
  id: number;
  order_number: number;
  customer: ShopifyCustomer | null;
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

function refundAmount(refund: ShopifyRefund): number {
  return refund.transactions
    .filter((t) => t.kind === "refund" && t.status === "success")
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

// Syncs orders created on/after `sinceIso`, including line items, refunds,
// and discount usage. `status=any` is required to pick up cancelled orders,
// which Shopify excludes from the default order listing.
export async function syncOrders(storeId: string, client: ShopifyAdminClient, sinceIso: string): Promise<number> {
  const params = new URLSearchParams({
    status: "any",
    limit: "250",
    created_at_min: sinceIso,
  });
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

async function upsertOrder(storeId: string, o: ShopifyOrder): Promise<void> {
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
