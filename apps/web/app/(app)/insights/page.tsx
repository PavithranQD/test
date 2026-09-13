import { getActiveStore } from "@repo/core";
import { prisma } from "@repo/db";

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "var(--danger)",
  MEDIUM: "#e0a955",
  LOW: "var(--muted)",
};

export default async function InsightsPage() {
  const store = await getActiveStore();
  if (!store) {
    return (
      <div>
        <h1>Insights</h1>
        <div className="card">
          <p style={{ color: "var(--muted)" }}>Connect a store in Settings first.</p>
        </div>
      </div>
    );
  }

  const alertsRaw = await prisma.alert.findMany({
    where: { storeId: store.id, status: "OPEN" },
    orderBy: { triggeredAt: "desc" },
  });
  const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const alerts = [...alertsRaw].sort((a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99));

  return (
    <div>
      <h1>Insights</h1>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Things That Need Attention</h3>
        {alerts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No open alerts. Rules run automatically after each day's metrics are computed, and
            immediately after relevant webhooks.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {alerts.map((alert) => (
              <li
                key={alert.id}
                style={{
                  padding: "10px 0",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: SEVERITY_COLOR[alert.severity] ?? "var(--muted)", fontSize: 12, fontWeight: 700, minWidth: 60 }}>
                  {alert.severity}
                </span>
                <span>{alert.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>
        AI-generated interpretation and recommended actions land here starting at M6.
      </p>
    </div>
  );
}
