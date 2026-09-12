import { getActiveStore } from "@repo/core";
import { prisma } from "@repo/db";

export default async function InventoryPage() {
  const store = await getActiveStore();
  if (!store) {
    return (
      <div>
        <h1>Inventory</h1>
        <div className="card">
          <p style={{ color: "var(--muted)" }}>Connect a store in Settings first.</p>
        </div>
      </div>
    );
  }

  const variants = await prisma.productVariant.findMany({
    where: { storeId: store.id },
    include: { product: true, inventoryLevels: true },
    orderBy: { title: "asc" },
    take: 100,
  });

  return (
    <div>
      <h1>Inventory</h1>
      <div className="card">
        {variants.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No inventory synced yet. Run <code>npm run import:historical</code>.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 13 }}>
                <th style={{ padding: "8px 4px" }}>Product</th>
                <th style={{ padding: "8px 4px" }}>SKU</th>
                <th style={{ padding: "8px 4px" }}>Available</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const available = v.inventoryLevels.reduce((sum, l) => sum + l.available, 0);
                return (
                  <tr key={v.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 4px" }}>
                      {v.product.title}
                      {v.title && v.title !== "Default Title" ? ` — ${v.title}` : ""}
                    </td>
                    <td style={{ padding: "8px 4px" }}>{v.sku ?? "-"}</td>
                    <td style={{ padding: "8px 4px" }}>{available}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        Sales velocity, days-of-coverage, and stockout risk land here starting at M3 (Metrics Engine).
      </p>
    </div>
  );
}
