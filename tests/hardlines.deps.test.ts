import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_TOKENS, ROOT } from "./helpers/scan.js";

const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as Record<string, Record<string, string> | undefined>;
const ALLOWED = new Set(["@types/node", "tsx", "typescript", "vitest", "plaid"]);
const VENDORS = [
  "stripe", "dwolla", "alpaca", "tradier", "ibkr", "ib-", "ccxt", "robinhood", "coinbase", "binance", "paypal", "braintree",
  "adyen", "moov", "modern-treasury", "increase", "lithic", "marqeta", "wise", "square", "checkout", "plaid-transfer", "tdameritrade",
  "schwab", "etrade", "webull", "tastytrade", "polygon-trade", "finix", "balanced", "authorize", "razorpay", "mollie",
];

function names(): string[] {
  const out: string[] = [];
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides"]) {
    out.push(...Object.keys(pkg[k] ?? {}));
  }
  return out;
}

function isBad(name: string): string | null {
  const toks = name.toLowerCase().split(/[@/._-]+/).filter(Boolean);
  for (const t of toks) if (FORBIDDEN_TOKENS.has(t)) return `token:${t}`;
  for (const v of VENDORS) if (name.toLowerCase().startsWith(v) || name.toLowerCase().includes(`/${v}`)) return `vendor:${v}`;
  if (/^@plaid\//.test(name)) return "scoped plaid package";
  return null;
}

describe("HARD LINES (e): dependencies contain no payment/brokerage SDKs", () => {
  it("package.json has only allowlisted packages (read-only 'plaid' is the sole finance SDK permitted)", () => {
    for (const n of names()) expect(ALLOWED.has(n), `unexpected dependency ${n}`).toBe(true);
  });

  it("no runtime dependencies besides (optionally) plaid", () => {
    for (const n of Object.keys(pkg.dependencies ?? {})) expect(n).toBe("plaid");
  });

  it("no dependency matches forbidden tokens or payment/brokerage vendor names", () => {
    for (const n of names()) expect(isBad(n), n).toBeNull();
  });

  it("the detector flags known payment/brokerage SDKs (self-check)", () => {
    for (const bad of ["stripe", "dwolla-v2", "@alpacahq/alpaca-trade-api", "ccxt", "@stripe/stripe-js", "payments-sdk", "ach-client", "wire-transfer-lib", "order-engine", "@plaid/transfer"]) {
      expect(isBad(bad), bad).not.toBeNull();
    }
  });

  it("lockfile (if present) resolves no forbidden package", () => {
    const lock = `${ROOT}pnpm-lock.yaml`;
    if (!existsSync(lock)) return;
    const text = readFileSync(lock, "utf8");
    const pkgs = new Set<string>();
    for (const m of text.matchAll(/^\s{2}'?(@?[a-z0-9][\w./-]*)@\d[^:\s']*'?:/gm)) pkgs.add(m[1]!);
    expect(pkgs.size).toBeGreaterThan(10);
    for (const n of pkgs) expect(isBad(n), n).toBeNull();
  });

  it("no install scripts that could fetch other packages", () => {
    const scripts = Object.values(pkg.scripts ?? {}).join("\n");
    expect(scripts).not.toMatch(/\b(preinstall|postinstall|npm i |pnpm add|curl|wget)\b/);
  });
});
