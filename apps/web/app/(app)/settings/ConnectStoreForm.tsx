"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectStoreForm({ hasExistingStore }: { hasExistingStore: boolean }) {
  const router = useRouter();
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/shopify/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopDomain, accessToken, apiKey, apiSecret }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to connect store");
      return;
    }

    setAccessToken("");
    setApiSecret("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="shopDomain">Shop domain</label>
        <input
          id="shopDomain"
          placeholder="your-store.myshopify.com"
          required
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
        />
      </div>
      <div className="form-row">
        <label htmlFor="accessToken">Admin API access token</label>
        <input
          id="accessToken"
          placeholder="shpat_..."
          required
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
        />
      </div>
      <div className="form-row">
        <label htmlFor="apiKey">API key</label>
        <input id="apiKey" required value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>
      <div className="form-row">
        <label htmlFor="apiSecret">API secret</label>
        <input
          id="apiSecret"
          type="password"
          required
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Connecting..." : hasExistingStore ? "Update credentials" : "Connect store"}
      </button>
    </form>
  );
}
