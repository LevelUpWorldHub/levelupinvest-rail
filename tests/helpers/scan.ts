import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const ROOT = new URL("../../", import.meta.url).pathname;

/** Identifier tokens (camelCase / snake_case / UPPER split, lowercased) that must never appear in shipped code. */
export const FORBIDDEN_TOKENS = new Set([
  "transfer", "transfers", "transferred",
  "payment", "payments", "payout", "payouts", "disburse", "remit", "remittance",
  "ach", "wire", "wires", "wired",
  "order", "orders", "ordered",
  "trade", "trades", "traded", "trading",
  "execute", "executes", "executed", "execution", "executor",
  "brokerage", "withdraw", "withdrawal", "withdrawals",
  "buy", "sell", "liquidate", "rebalance",
]);

/** Joined (lowercased, separators removed) identifiers that are forbidden. */
export const FORBIDDEN_JOINED = ["placeorder", "submitorder", "paymentinitiation", "banktransfer", "brokerageexecution", "sendmoney", "movemoney"];

/** Raw-text patterns (endpoints / products). */
export const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ["/transfer/ endpoint", /\/transfer/i],
  ["/payment endpoint", /\/payment/i],
  ["payment_initiation", /payment[_-]?initiation/i],
  ["/processor/ endpoint", /\/processor\//i],
  ["/auth/ endpoint", /\/auth\//i],
  ["auth product", /products[^\n]*["']auth["']/i],
  ["/signal/ endpoint", /\/signal\//i],
  ["/bank_transfer", /bank[_-]?transfer/i],
  ["investments write/order API", /\/investments\/(?!transactions\/get|holdings\/get)/i],
  ["/order or /trade endpoint", /\/(orders?|trades?|wires?|ach)\b/i],
];

export function tokensOf(text: string): string[] {
  const out: string[] = [];
  for (const word of text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
    out.push(word.toLowerCase());
    const parts = word
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .split(" ");
    if (parts.length > 1) for (const p of parts) out.push(p.toLowerCase());
  }
  return out;
}

export function findViolations(text: string): string[] {
  const hits = new Set<string>();
  for (const tok of tokensOf(text)) {
    if (FORBIDDEN_TOKENS.has(tok)) hits.add(`token:${tok}`);
    if (FORBIDDEN_JOINED.includes(tok)) hits.add(`identifier:${tok}`);
  }
  const joined = (text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((w) => w.replace(/_/g, "").toLowerCase());
  for (const j of joined) for (const f of FORBIDDEN_JOINED) if (j.includes(f)) hits.add(`identifier:${f}`);
  for (const [label, re] of FORBIDDEN_PATTERNS) if (re.test(text)) hits.add(`pattern:${label}`);
  return [...hits].sort();
}

export function walk(dir: string, skip: (rel: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (skip(rel)) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, skip));
    else out.push(full);
  }
  return out;
}

export function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Files shipped as product: all of src plus manifest and config. */
export function shippedFiles(): string[] {
  const files = walk(join(ROOT, "src"));
  for (const f of ["package.json", "tools.json", "tsconfig.json", "vitest.config.ts", ".env.example", ".github/workflows/ci.yml"]) {
    files.push(join(ROOT, f));
  }
  return files;
}
