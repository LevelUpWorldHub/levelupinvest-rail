"use client";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Plaid?: { create(o: { token: string; onSuccess(publicToken: string, meta: { institution?: { name?: string } | null }): void }): { open(): void } };
  }
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Plaid Link failed to load"));
    document.body.appendChild(s);
  });
}

const dollars = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function DashboardClient({ canLink, isPro }: { canLink: boolean; isPro: boolean }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => fetch("/api/insights").then((r) => r.json()).then(setData);
  useEffect(() => { void refresh(); }, []);

  async function link() {
    const r = await fetch("/api/plaid/link-token", { method: "POST" });
    const d = (await r.json()) as { linkToken?: string; error?: string };
    if (!d.linkToken) return setMsg(d.error ?? "Could not start Plaid Link");
    await loadPlaidScript();
    window.Plaid!.create({
      token: d.linkToken,
      onSuccess: async (publicToken, meta) => {
        const x = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken, institutionName: meta.institution?.name ?? null }) });
        setMsg(x.ok ? "Linked (sandbox)." : "Link failed");
        void refresh();
      },
    }).open();
  }
  async function portal() {
    const d = (await (await fetch("/api/billing/portal", { method: "POST" })).json()) as { url?: string; error?: string };
    if (d.url) window.location.href = d.url; else setMsg(d.error ?? "No billing account");
  }

  const nw = data?.netWorth as { netWorthCents?: number } | undefined;
  return (
    <div>
      <p>
        {canLink ? <button onClick={link}>Link a bank (Plaid sandbox)</button> : <a href="/pricing">Upgrade to Pro to link a bank</a>}{" "}
        {isPro && <button onClick={portal}>Manage billing</button>}
      </p>
      {msg && <p>{msg}</p>}
      {data && (
        <>
          <p>Data source: <b>{String(data.source)}</b>{data.source === "mock" && " (sample data)"}</p>
          {typeof nw?.netWorthCents === "number" && <p>Net worth: {dollars(nw.netWorthCents)}</p>}
          <pre style={{ background: "#f6f6f6", padding: 12, overflow: "auto", fontSize: 12 }}>{JSON.stringify({ topCategories: data.topCategories, recurring: data.recurring }, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
