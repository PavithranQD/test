import Link from "next/link";
import { getActiveStore } from "@repo/core";
import { prisma } from "@repo/db";

export default async function DashboardPage() {
  const store = await getActiveStore();

  if (!store) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Connect your Shopify store to get started</h2>
        <p>No store is connected yet.</p>
        <Link href="/settings">
          <button>Go to Settings</button>
        </Link>
      </div>
    );
  }

  const [productCount, orderCount, customerCount] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.order.count({ where: { storeId: store.id } }),
    prisma.customer.count({ where: { storeId: store.id } }),
  ]);

  const hasData = productCount + orderCount + customerCount > 0;

  return (
    <div>
      <h1>Business Overview</h1>
      <div className="card">
        <p>
          Connected store: <strong>{store.name}</strong> ({store.shopDomain})
        </p>
        {!hasData && (
          <p style={{ color: "var(--muted)" }}>
            No data synced yet. Run the historical import: <code>npm run import:historical</code>
          </p>
        )}
      </div>
      <div className="card">
        <p>Products synced: {productCount}</p>
        <p>Orders synced: {orderCount}</p>
        <p>Customers synced: {customerCount}</p>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Revenue/order/AOV metrics, alerts, and AI insights land here starting at M3–M6 of the build
        plan.
      </p>
    </div>
  );
}
