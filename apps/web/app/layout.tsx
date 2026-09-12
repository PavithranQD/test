import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Shopify AI Business Intelligence",
  description: "Phase 1 — Shopify AI Business Intelligence Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
