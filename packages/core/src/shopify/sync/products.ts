import { prisma } from "@repo/db";
import { ShopifyAdminClient } from "../adminClient";

export interface ShopifyVariant {
  id: number;
  sku: string | null;
  title: string;
  price: string;
  compare_at_price: string | null;
  inventory_item_id: number | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string | null;
  product_type: string | null;
  status: string;
  variants: ShopifyVariant[];
}

interface InventoryLevelRow {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
}

// Upserts one product and its variants. Shared by the bulk historical sync
// below and the products/create|update webhook handler, both of which
// receive the same Shopify product JSON shape.
export async function upsertProduct(storeId: string, p: ShopifyProduct): Promise<void> {
  const product = await prisma.product.upsert({
    where: { storeId_shopifyProductId: { storeId, shopifyProductId: BigInt(p.id) } },
    update: { title: p.title, vendor: p.vendor, productType: p.product_type, status: p.status },
    create: {
      storeId,
      shopifyProductId: BigInt(p.id),
      title: p.title,
      vendor: p.vendor,
      productType: p.product_type,
      status: p.status,
    },
  });

  for (const v of p.variants) {
    await prisma.productVariant.upsert({
      where: { storeId_shopifyVariantId: { storeId, shopifyVariantId: BigInt(v.id) } },
      update: {
        sku: v.sku,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        inventoryItemId: v.inventory_item_id ? BigInt(v.inventory_item_id) : null,
      },
      create: {
        storeId,
        productId: product.id,
        shopifyVariantId: BigInt(v.id),
        sku: v.sku,
        title: v.title,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        inventoryItemId: v.inventory_item_id ? BigInt(v.inventory_item_id) : null,
      },
    });
  }
}

// Upserts one inventory level row. Shared by the bulk sync below and the
// inventory_levels/update webhook handler.
export async function upsertInventoryLevel(storeId: string, level: InventoryLevelRow): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: { storeId, inventoryItemId: BigInt(level.inventory_item_id) },
    select: { id: true },
  });
  if (!variant) return;

  await prisma.inventoryLevel.upsert({
    where: {
      storeId_shopifyInventoryItemId_shopifyLocationId: {
        storeId,
        shopifyInventoryItemId: BigInt(level.inventory_item_id),
        shopifyLocationId: BigInt(level.location_id),
      },
    },
    update: { available: level.available ?? 0 },
    create: {
      storeId,
      variantId: variant.id,
      shopifyInventoryItemId: BigInt(level.inventory_item_id),
      shopifyLocationId: BigInt(level.location_id),
      available: level.available ?? 0,
    },
  });
}

// Paginates through every product (and its variants) in the store and
// upserts them. Returns the count processed, used for SyncJob bookkeeping.
export async function syncProducts(storeId: string, client: ShopifyAdminClient): Promise<number> {
  return fetchAndUpsertProducts(storeId, client, "/products.json?limit=250");
}

// Syncs only products updated on/after `sinceIso` -- used by
// reconciliation instead of the full catalog scan above, since re-pulling
// every product every few hours doesn't scale with catalog size.
export async function syncRecentlyUpdatedProducts(storeId: string, client: ShopifyAdminClient, sinceIso: string): Promise<number> {
  const params = new URLSearchParams({ limit: "250", updated_at_min: sinceIso });
  return fetchAndUpsertProducts(storeId, client, `/products.json?${params.toString()}`);
}

async function fetchAndUpsertProducts(storeId: string, client: ShopifyAdminClient, initialPath: string): Promise<number> {
  let url: string | null = client.restUrl(initialPath);
  let processed = 0;
  const variantIdToInventoryItemId = new Map<number, number>();

  while (url) {
    const currentUrl: string = url;
    const { body, nextUrl } = await client.restPage<{ products: ShopifyProduct[] }>(currentUrl);

    for (const p of body.products) {
      await upsertProduct(storeId, p);
      for (const v of p.variants) {
        if (v.inventory_item_id) {
          variantIdToInventoryItemId.set(v.inventory_item_id, v.id);
        }
      }
      processed += 1;
    }

    url = nextUrl;
  }

  await syncInventoryLevels(storeId, client, [...variantIdToInventoryItemId.keys()]);
  return processed;
}

// Shopify's inventory_levels endpoint takes inventory_item_ids in batches of
// up to 50 and returns per-location availability.
async function syncInventoryLevels(storeId: string, client: ShopifyAdminClient, inventoryItemIds: number[]): Promise<void> {
  const BATCH_SIZE = 50;
  for (let i = 0; i < inventoryItemIds.length; i += BATCH_SIZE) {
    const batch = inventoryItemIds.slice(i, i + BATCH_SIZE);
    let url: string | null = client.restUrl(`/inventory_levels.json?inventory_item_ids=${batch.join(",")}&limit=250`);

    while (url) {
      const currentUrl: string = url;
      const { body, nextUrl } = await client.restPage<{ inventory_levels: InventoryLevelRow[] }>(currentUrl);

      for (const level of body.inventory_levels) {
        await upsertInventoryLevel(storeId, level);
      }

      url = nextUrl;
    }
  }
}
