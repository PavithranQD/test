const API_VERSION = "2025-01";

// Shopify's Link header looks like: <https://.../orders.json?page_info=xyz>; rel="next"
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.split(",").find((part) => part.includes('rel="next"'));
  if (!match) return null;
  const urlMatch = match.match(/<([^>]+)>/);
  return urlMatch ? urlMatch[1] : null;
}

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

// Thin wrapper around Shopify's Admin REST + GraphQL APIs, authenticated with
// a static custom-app access token (no OAuth dance — the token is provided
// once by the merchant via /settings and stored encrypted).
export class ShopifyAdminClient {
  constructor(private credentials: ShopifyCredentials) {}

  private baseUrl(): string {
    return `https://${this.credentials.shopDomain}/admin/api/${API_VERSION}`;
  }

  // Returns the parsed body plus the "next" page URL (from the Link header)
  // so callers can page through large collections (e.g. 6-12 months of orders).
  async restPage<T>(url: string, init: RequestInit = {}): Promise<{ body: T; nextUrl: string | null }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: {
          "X-Shopify-Access-Token": this.credentials.accessToken,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });

      if (res.status === 429) {
        const retryAfterSeconds = Number(res.headers.get("Retry-After") ?? "1");
        await new Promise((r) => setTimeout(r, retryAfterSeconds * 1000));
        continue;
      }

      const body = await res.json().catch(() => undefined);
      if (!res.ok) {
        throw new ShopifyApiError(`Shopify REST request failed: ${res.status}`, res.status, body);
      }

      const nextUrl = parseNextLink(res.headers.get("Link"));
      return { body: body as T, nextUrl };
    }
    throw new ShopifyApiError("Shopify REST request failed after repeated 429 rate limiting", 429, undefined);
  }

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { body } = await this.restPage<T>(`${this.baseUrl()}${path}`, init);
    return body;
  }

  restUrl(path: string): string {
    return `${this.baseUrl()}${path}`;
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl()}/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": this.credentials.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json().catch(() => undefined);
    if (!res.ok || body?.errors) {
      throw new ShopifyApiError(`Shopify GraphQL request failed: ${res.status}`, res.status, body);
    }
    return body.data as T;
  }

  // Used to validate a newly-entered token and pull shop metadata (currency,
  // timezone, name) when the merchant connects the store in /settings.
  async getShop(): Promise<{
    shop: { name: string; currency: string; iana_timezone: string; myshopify_domain: string };
  }> {
    return this.rest("/shop.json");
  }
}
