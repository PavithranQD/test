import { prisma } from "@repo/db";
import { ShopifyAdminClient } from "../adminClient";

interface ShopifyVariant {
  id: number;
  sku: string | null;
  title: string;
  price: string;
  compare_at_price: string | null;
  inventory_item_id: number | null;
}

interface ShopifyProduct {
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

// Paginates through every product (and its variants) in the store and
// upserts them. Returns the count processed, used for SyncJob bookkeeping.
export async function syncProducts(storeId: string, client: ShopifyAdminClient): Promise<number> {
  let url: string | null = client.restUrl("/products.json?limit=250");
  let processed = 0;
  const variantIdToInventoryItemId = new Map<number, number>();

  while (url) {
    const currentUrl: string = url;
    const { body, nextUrl } = await client.restPage<{ products: ShopifyProduct[] }>(currentUrl);

    for (const p of body.products) {
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
        const variant = await prisma.productVariant.findFirst({
          where: { storeId, inventoryItemId: BigInt(level.inventory_item_id) },
          select: { id: true },
        });
        if (!variant) continue;

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

      url = nextUrl;
    }
  }
}
