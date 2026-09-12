import { getActiveStore } from "@repo/core";
import { ConnectStoreForm } from "./ConnectStoreForm";

export default async function SettingsPage() {
  const store = await getActiveStore();

  return (
    <div>
      <h1>Settings</h1>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Shopify Store Connection</h3>
        {store ? (
          <p>
            <span className="status-pill status-connected">Connected</span>{" "}
            <strong>{store.name}</strong> ({store.shopDomain})
          </p>
        ) : (
          <p>
            <span className="status-pill status-disconnected">Not connected</span>
          </p>
        )}
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Create a Custom App in Shopify Admin (Settings → Apps and sales channels → Develop apps),
          grant it <code>read_products</code>, <code>read_orders</code>, <code>read_customers</code>,{" "}
          <code>read_inventory</code>, and <code>read_discounts</code> scopes, install it, then paste
          its credentials below.
        </p>
        <ConnectStoreForm hasExistingStore={!!store} />
      </div>
    </div>
  );
}
