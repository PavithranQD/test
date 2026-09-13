import { createHmac, timingSafeEqual } from "node:crypto";

// Verifies the X-Shopify-Hmac-Sha256 header against the raw request body,
// using the store's API secret. Must be called with the raw (unparsed)
// body -- any JSON.parse/re-stringify round trip can change byte-for-byte
// formatting and break the signature check.
export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null, apiSecret: string): boolean {
  if (!hmacHeader) return false;

  const computed = createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");

  const computedBuffer = Buffer.from(computed);
  const providedBuffer = Buffer.from(hmacHeader);
  if (computedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(computedBuffer, providedBuffer);
}
