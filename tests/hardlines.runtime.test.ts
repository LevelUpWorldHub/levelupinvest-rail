import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { READ_METHODS } from "../src/providers/types.js";

const WRITE_VERBS = new Set([
  "place", "submit", "execute", "transfer", "pay", "send", "wire", "initiate", "cancel", "modify",
  "update", "delete", "remove", "write", "put", "post", "set", "buy", "sell", "trade", "order",
  "withdraw", "deposit", "move", "ach", "exercise", "liquidate", "rebalance", "fund",
]);
// Class methods are held to a stricter list (also no create/add/patch).
const STRICT_VERBS = new Set([...WRITE_VERBS, "create", "add", "patch"]);

function firstToken(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[ _]/)[0]!.toLowerCase();
}

function protoMethods(cls: { prototype: object }): string[] {
  return Object.getOwnPropertyNames(cls.prototype).filter((n) => n !== "constructor");
}

const LINK_HELPERS = ["requestLinkToken", "exchangePublicToken"];
const classes = Object.entries(api).filter(([, v]) => typeof v === "function" && /^class\s/.test(Function.prototype.toString.call(v)));

describe("HARD LINES (b): provider interface and exported classes have no write-capable methods", () => {
  it("READ_METHODS is exactly the six read methods", () => {
    expect([...READ_METHODS].sort()).toEqual(
      ["getBalances", "getRecurring", "listAccounts", "listInstitutions", "listTransactions", "searchInstitutions"].sort(),
    );
  });

  it("AggregationProvider interface source declares exactly the read methods", () => {
    const src = readFileSync(new URL("../src/providers/types.ts", import.meta.url), "utf8");
    const block = /export interface AggregationProvider \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";
    const names = [...block.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]).sort();
    expect(names).toEqual([...READ_METHODS].sort());
  });

  it("finds the exported classes to reflect over", () => {
    const names = classes.map(([n]) => n);
    expect(names).toEqual(expect.arrayContaining(["MockProvider", "PlaidProvider", "PlaidClient"]));
  });

  for (const [name, cls] of classes) {
    it(`class ${name}: no write-verb methods (prototype + statics)`, () => {
      const c = cls as unknown as { prototype: object };
      const methods = [...protoMethods(c), ...Object.getOwnPropertyNames(cls).filter((n) => !["length", "name", "prototype"].includes(n))];
      for (const m of methods) expect(STRICT_VERBS.has(firstToken(m)), `${name}.${m}`).toBe(false);
    });
  }

  for (const [name, cls] of [["MockProvider", api.MockProvider], ["PlaidProvider", api.PlaidProvider]] as const) {
    it(`provider ${name}: methods are exactly read methods (+ Plaid link helpers, toJSON)`, () => {
      const allowed = new Set<string>([...READ_METHODS, ...(name === "PlaidProvider" ? [...LINK_HELPERS, "toJSON"] : [])]);
      for (const m of protoMethods(cls)) expect(allowed.has(m), `${name}.${m}`).toBe(true);
      for (const r of READ_METHODS) expect(typeof (cls.prototype as unknown as Record<string, unknown>)[r]).toBe("function");
    });
  }

  it("MockProvider instance exposes no write-capable properties", () => {
    const p = new api.MockProvider();
    for (const k of Object.keys(p)) expect(WRITE_VERBS.has(firstToken(k)), k).toBe(false);
    for (const forbidden of ["placeOrder", "transfer", "pay", "execute", "createTransfer", "initiatePayment", "wire", "trade"]) {
      expect((p as unknown as Record<string, unknown>)[forbidden]).toBeUndefined();
    }
  });

  it("no exported function/value starts with a write verb", () => {
    for (const name of Object.keys(api)) expect(WRITE_VERBS.has(firstToken(name)), name).toBe(false);
  });

  it("PlaidClient exposes a single call method", () => {
    expect(protoMethods(api.PlaidClient).sort()).toEqual(["callReadEndpoint", "toJSON"]);
  });

  it("every tool in the registry is backed by a read-only provider method set", () => {
    for (const t of api.TOOLS) expect(WRITE_VERBS.has(firstToken(t.name)), t.name).toBe(false);
  });
});
