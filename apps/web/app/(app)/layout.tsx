import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "../../lib/session";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/insights", label: "Insights" },
  { href: "/products", label: "Products" },
  { href: "/inventory", label: "Inventory" },
  { href: "/chat", label: "AI Chat" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();

  return (
    <div className="shell">
      <nav className="sidebar">
        <div style={{ fontWeight: 700, padding: "0 12px 20px" }}>Shopify BI</div>
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
