import { getActiveStore } from "@repo/core";
import { prisma } from "@repo/db";

export default async function ProductsPage() {
  const store = await getActiveStore();
  if (!store) {
    return (
      <div>
        <h1>Products</h1>
        <div className="card">
          <p style={{ color: "var(--muted)" }}>Connect a store in Settings first.</p>
        </div>
      </div>
    );
  }

  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    include: { variants: true },
    orderBy: { title: "asc" },
    take: 100,
  });

  return (
    <div>
      <h1>Products</h1>
      <div className="card">
        {products.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No products synced yet. Run <code>npm run import:historical</code>.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                <th style={{ padding: "8px 4px" }}>Title</th>
                <th style={{ padding: "8px 4px" }}>Vendor</th>
                <th style={{ padding: "8px 4px" }}>Status</th>
                <th style={{ padding: "8px 4px" }}>Variants</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 4px" }}>{p.title}</td>
                  <td style={{ padding: "8px 4px" }}>{p.vendor ?? "-"}</td>
                  <td style={{ padding: "8px 4px" }}>{p.status ?? "-"}</td>
                  <td style={{ padding: "8px 4px" }}>{p.variants.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Best/worst-seller ranking and revenue contribution land here starting at M3 (Metrics Engine).
      </p>
    </div>
  );
}
