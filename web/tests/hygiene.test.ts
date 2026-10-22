import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInsights } from "../src/lib/insights";
import { MockProvider } from "@rail/providers/mock";

const ROOT = new URL("../", import.meta.url).pathname;
function walk(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const f = join(d, n); const r = relative(ROOT, f);
    if (/^(node_modules|\.next|coverage|tests)(\/|$)/.test(r)) return [];
    return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
  });
}
const src = walk(ROOT).map((f) => [relative(ROOT, f), readFileSync(f, "utf8")] as const);

describe("web hygiene", () => {
  it(".env.example values are all empty", () => {
    const lines = readFileSync(join(ROOT, ".env.example"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(10);
    for (const l of lines) expect(l.split("=").slice(1).join("="), l).toBe("");
  });
  it("Stripe usage is limited to subscriptions billing surfaces (no payouts/transfers/charges/PaymentIntents)", () => {
    for (const [f, t] of src) {
      expect(t, f).not.toMatch(/\.(payouts|transfers|charges|paymentIntents|refunds|topups|accounts)\./);
      expect(t, f).not.toMatch(/payment_method_types/);
    }
  });
  it("no hard-coded secrets", () => {
    for (const [f, t] of src) expect(t, f).not.toMatch(/(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{16,}/);
  });
  it("plaid access tokens are only persisted through encryptSecret", () => {
    const plaid = src.find(([f]) => f === "src/lib/plaid.ts")![1];
    expect(plaid).toMatch(/accessTokenEnc: encryptSecret\(/);
  });
});

describe("insights gating", () => {
  it("free omits recurring detection; pro includes it", async () => {
    const p = new MockProvider();
    expect((await buildInsights(p, "free", "2026-07-01", "2026-10-01")).recurring).toBeNull();
    expect((await buildInsights(p, "pro", "2026-07-01", "2026-10-01")).recurring).not.toBeNull();
  });
});
