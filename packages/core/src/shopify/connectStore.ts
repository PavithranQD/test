import { prisma } from "@repo/db";
import { encryptSecret, decryptSecret } from "../security/crypto";
import { ShopifyAdminClient } from "./adminClient";

export interface ConnectStoreInput {
  shopDomain: string;
  accessToken: string;
  apiKey: string;
  apiSecret: string;
  scopes: string;
}

function normalizeShopDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Validates the custom-app token against Shopify, then encrypts and stores
// it. This is the only place a plaintext Shopify token exists outside of the
// merchant's own Shopify Admin — never logged, never returned to the client.
export async function connectStore(input: ConnectStoreInput) {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const client = new ShopifyAdminClient({ shopDomain, accessToken: input.accessToken });
  const { shop } = await client.getShop();

  const store = await prisma.store.upsert({
    where: { shopDomain },
    update: {
      name: shop.name,
      accessTokenCiphertext: encryptSecret(input.accessToken),
      apiKey: input.apiKey,
      apiSecretCiphertext: encryptSecret(input.apiSecret),
      scopes: input.scopes,
      currency: shop.currency,
      timezone: shop.iana_timezone,
      isActive: true,
      connectedAt: new Date(),
    },
    create: {
      shopDomain,
      name: shop.name,
      accessTokenCiphertext: encryptSecret(input.accessToken),
      apiKey: input.apiKey,
      apiSecretCiphertext: encryptSecret(input.apiSecret),
      scopes: input.scopes,
      currency: shop.currency,
      timezone: shop.iana_timezone,
      connectedAt: new Date(),
    },
  });

  return store;
}

export async function getAdminClientForStore(storeId: string): Promise<{ client: ShopifyAdminClient; shopDomain: string }> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const accessToken = decryptSecret(store.accessTokenCiphertext);
  return { client: new ShopifyAdminClient({ shopDomain: store.shopDomain, accessToken }), shopDomain: store.shopDomain };
}

export async function getActiveStore() {
  return prisma.store.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
}
