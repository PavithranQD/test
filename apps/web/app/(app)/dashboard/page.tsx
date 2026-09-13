import Link from "next/link";
import { getActiveStore, getPeriodComparison } from "@repo/core";
import { prisma } from "@repo/db";

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "var(--danger)",
  MEDIUM: "#e0a955",
  LOW: "var(--muted)",
};

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toFixed(0);
  }
}

function ChangeBadge({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.05) return <span style={{ color: "var(--muted)" }}>–</span>;
  const up = pct > 0;
  return <span style={{ color: up ? "var(--success)" : "var(--danger)" }}>{up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%</span>;
}

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

  const [productCount, orderCount, customerCount, week, alertsRaw] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.order.count({ where: { storeId: store.id } }),
    prisma.customer.count({ where: { storeId: store.id } }),
    getPeriodComparison(store.id, 7),
    prisma.alert.findMany({ where: { storeId: store.id, status: "OPEN" }, orderBy: { triggeredAt: "desc" } }),
  ]);

  const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const topAlerts = [...alertsRaw].sort((a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99)).slice(0, 5);

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

      {hasData && (
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>Last 7 days vs previous 7 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Revenue</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatCurrency(week.current.grossRevenue, store.currency)}</div>
              <ChangeBadge pct={week.changePct.grossRevenue} />
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Orders</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{week.current.orderCount}</div>
              <ChangeBadge pct={week.changePct.orderCount} />
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Average Order Value</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatCurrency(week.current.aov, store.currency)}</div>
              <ChangeBadge pct={week.changePct.aov} />
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Refund Rate</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{week.current.refundRate.toFixed(1)}%</div>
              <ChangeBadge pct={week.changePct.refundRate} />
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Things That Need Attention</h3>
          {topAlerts.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No open alerts right now.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {topAlerts.map((alert) => (
                <li key={alert.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
                  <span style={{ color: SEVERITY_COLOR[alert.severity] ?? "var(--muted)", fontSize: 12, fontWeight: 700, minWidth: 60 }}>
                    {alert.severity}
                  </span>
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p style={{ marginBottom: 0 }}>
            <Link href="/insights" style={{ color: "var(--accent)", fontSize: 13 }}>
              View all insights →
            </Link>
          </p>
        </div>
      )}

      <div className="card">
        <p style={{ margin: 0 }}>Products synced: {productCount}</p>
        <p style={{ margin: 0 }}>Orders synced: {orderCount}</p>
        <p style={{ margin: 0 }}>Customers synced: {customerCount}</p>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        AI-generated business reports and the chat assistant land here starting at M6/M7.
      </p>
    </div>
  );
}
