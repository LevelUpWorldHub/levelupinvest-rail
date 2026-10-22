"use client";
import { useState } from "react";

export function CheckoutButton({ interval, label }: { interval: "monthly" | "yearly"; label: string }) {
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setErr(null);
    const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval }) });
    if (r.status === 401) return void (window.location.href = "/login");
    const d = (await r.json()) as { url?: string; error?: string };
    if (d.url) window.location.href = d.url;
    else setErr(d.error ?? "Something went wrong");
  }
  return <><button onClick={go}>{label}</button>{err && <small style={{ color: "#a00" }}> {err}</small>}</>;
}
