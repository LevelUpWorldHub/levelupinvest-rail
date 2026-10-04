import { describe, expect, it } from "vitest";
import { FORBIDDEN_TOKENS, findViolations, read, shippedFiles, ROOT } from "./helpers/scan.js";
import { relative } from "node:path";

describe("HARD LINES (a): static scan proves forbidden code paths do not exist", () => {
  const files = shippedFiles();

  it("scans a meaningful set of files (src + manifest)", () => {
    const rels = files.map((f) => relative(ROOT, f));
    expect(rels.filter((r) => r.startsWith("src/")).length).toBeGreaterThanOrEqual(15);
    expect(rels).toContain("package.json");
    expect(rels).toContain("tools.json");
  });

  for (const f of files) {
    it(`no forbidden identifiers/endpoints in ${relative(ROOT, f)}`, () => {
      expect(findViolations(read(f))).toEqual([]);
    });
  }

  it("scanner self-check: detects every kind of forbidden thing", () => {
    const bad = [
      "function placeOrder() {}",
      "const x = '/transfer/create'",
      "products: ['payment_initiation']",
      "fetch('/payment/initiate')",
      "const ACH = 1",
      "async function sendWire() {}",
      "class TradeExecutor {}",
      "execute_trade()",
      "products: ['auth']",
      "post('/investments/orders/create')",
      "brokerage",
      "const withdrawal = 1",
    ];
    for (const b of bad) expect(findViolations(b), b).not.toEqual([]);
  });

  it("scanner self-check: does not flag benign words", () => {
    for (const ok of ["each reach teach", "transactions/sync", "/investments/transactions/get", "payroll"]) {
      expect(findViolations(ok), ok).toEqual([]);
    }
  });

  it("forbidden token list covers the required classes", () => {
    for (const t of ["transfer", "payment", "ach", "wire", "order", "trade", "execute", "brokerage"]) {
      expect(FORBIDDEN_TOKENS.has(t)).toBe(true);
    }
  });
});
