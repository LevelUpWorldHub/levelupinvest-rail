import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = { title: "LevelUpInvest", description: "Read-only budgeting, spending, goals and net worth." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "0 auto", padding: 24, lineHeight: 1.5 }}>
        <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <Link href="/"><b>LevelUpInvest</b></Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/dashboard">Dashboard</Link>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#a00" }}>TEST MODE — no real charges</span>
        </nav>
        {children}
        <footer style={{ marginTop: 48, fontSize: 12, color: "#666" }}>
          Information only — not financial, tax or legal advice. Read-only: this app never moves money or places trades.{" "}
          <Link href="/legal/privacy">Privacy (draft)</Link> · <Link href="/legal/terms">Terms (draft)</Link>
        </footer>
      </body>
    </html>
  );
}
