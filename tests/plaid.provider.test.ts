import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PLAID_ENDPOINTS,
  NoLinkedItemsError,
  PlaidApiError,
  PlaidProvider,
  type FetchLike,
} from "../src/index.js";

type Call = { url: string; method: string; body: Record<string, unknown> };

function harness(routes: Record<string, (body: Record<string, unknown>, n: number) => unknown>, tokens = ["tok-1"]) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const fetchImpl: FetchLike = async (url: string, init: { method: string; body: string }) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, method: init.method, body });
    counts[path] = (counts[path] ?? 0) + 1;
    const r = routes[path];
    if (!r) return { ok: false, status: 404, json: async () => ({ error_type: "X", error_code: "NO_ROUTE", error_message: "no route" }) };
    const out = r(body, counts[path]!);
    if (out instanceof Error) return { ok: false, status: 400, json: async () => ({ error_type: "INVALID_REQUEST", error_code: "BAD", error_message: out.message }) };
    return { ok: true, status: 200, json: async () => out };
  };
  const p = new PlaidProvider({ clientId: "test-client-id", secret: "test-secret-value", env: "sandbox", accessTokens: tokens }, { fetchImpl });
  return { p, calls };
}

const account = (id: string, type: string, cur: number, avail: number | null, limit: number | null = null) => ({
  account_id: id, name: `Acct ${id}`, mask: "1234", type, subtype: "checking",
  balances: { current: cur, available: avail, limit, iso_currency_code: "USD" },
});

describe("PlaidProvider (fake transport — no network)", () => {
  it("maps accounts and balances (dollars -> cents)", async () => {
    const { p, calls } = harness({
      "/accounts/balance/get": () => ({
        accounts: [account("a1", "depository", 1234.56, 1200.5), account("a2", "credit", 99.99, 900.01, 1000)],
        item: { institution_id: "ins_3" },
      }),
    });
    const accts = await p.listAccounts();
    expect(accts).toEqual([
      { id: "a1", institutionId: "ins_3", name: "Acct a1", mask: "1234", type: "depository", subtype: "checking" },
      { id: "a2", institutionId: "ins_3", name: "Acct a2", mask: "1234", type: "credit", subtype: "checking" },
    ]);
    const bal = await p.getBalances(["a2"]);
    expect(bal).toHaveLength(1);
    expect(bal[0]).toMatchObject({ accountId: "a2", currentCents: 9999, availableCents: 90001, limitCents: 100000, currency: "USD" });
    expect(calls.every((c) => c.body.access_token === "tok-1")).toBe(true);
  });

  it("pages /transactions/sync, applies modified/removed, filters by date", async () => {
    const tx = (id: string, date: string, amount: number, primary = "FOOD_AND_DRINK", detailed = "FOOD_AND_DRINK_RESTAURANT") => ({
      transaction_id: id, account_id: "a1", date, name: `N-${id}`, merchant_name: `M-${id}`, amount, pending: false,
      personal_finance_category: { primary, detailed },
    });
    const { p, calls } = harness({
      "/transactions/sync": (body, n) =>
        n === 1
          ? { added: [tx("t1", "2026-09-10", 12.34), tx("t2", "2026-09-11", 50, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), tx("t3", "2026-01-01", 5)], modified: [], removed: [], next_cursor: "c1", has_more: true }
          : { added: [], modified: [tx("t1", "2026-09-10", 20)], removed: [{ transaction_id: "t2" }], next_cursor: "c2", has_more: false },
    });
    const out = await p.listTransactions({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(out.map((t) => t.id)).toEqual(["t1"]);
    expect(out[0]).toMatchObject({ amountCents: 2000, category: "dining", merchant: "M-t1" });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.cursor).toBe("c1");
  });

  it("maps categories (grocery/rent/income/unknown)", async () => {
    const mk = (id: string, primary: string, detailed: string) => ({ transaction_id: id, account_id: "a1", date: "2026-09-02", name: id, amount: 1, personal_finance_category: { primary, detailed } });
    const { p } = harness({
      "/transactions/sync": () => ({
        added: [mk("g", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), mk("r", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"), mk("u", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"), mk("i", "INCOME", "INCOME_WAGES"), mk("z", "SOMETHING_NEW", "X")],
        modified: [], removed: [], next_cursor: "c", has_more: false,
      }),
    });
    const cats = Object.fromEntries((await p.listTransactions({ startDate: "2026-09-01", endDate: "2026-09-30" })).map((t) => [t.id, t.category]));
    expect(cats).toEqual({ g: "groceries", r: "housing", u: "utilities", i: "income", z: "other" });
  });

  it("maps recurring streams", async () => {
    const { p } = harness({
      "/transactions/recurring/get": () => ({
        inflow_streams: [{ stream_id: "s1", account_id: "a1", description: "PAYROLL", merchant_name: null, frequency: "BIWEEKLY", average_amount: { amount: -2850 }, last_date: "2026-09-18", predicted_next_date: "2026-10-02", is_active: true, personal_finance_category: { primary: "INCOME" } }],
        outflow_streams: [{ stream_id: "s2", account_id: "a1", description: "NETFLIX", merchant_name: "Netflix", frequency: "MONTHLY", average_amount: { amount: 15.49 }, last_date: "2026-09-12", predicted_next_date: "2026-10-12", is_active: true, personal_finance_category: { primary: "ENTERTAINMENT" } }],
      }),
    });
    const r = await p.getRecurring();
    expect(r[0]).toMatchObject({ id: "s1", direction: "inflow", frequency: "biweekly", averageAmountCents: 285000, category: "income" });
    expect(r[1]).toMatchObject({ id: "s2", direction: "outflow", frequency: "monthly", averageAmountCents: 1549, merchant: "Netflix", category: "entertainment" });
  });

  it("searches and lists institutions with transactions product only", async () => {
    const { p, calls } = harness({
      "/institutions/search": () => ({ institutions: [{ institution_id: "ins_1", name: "First Bank", country_codes: ["US"], url: "https://first.example" }, { institution_id: "ins_2", name: "Second", country_codes: ["US"] }] }),
      "/institutions/get": () => ({ institutions: [{ institution_id: "ins_9", name: "Nine", country_codes: ["US"] }] }),
    });
    expect((await p.searchInstitutions("bank", { limit: 1 })).map((i) => i.id)).toEqual(["ins_1"]);
    expect((await p.listInstitutions()).map((i) => i.id)).toEqual(["ins_9"]);
    expect(calls[0]!.body.products).toEqual(["transactions"]);
    expect(calls[0]!.body.query).toBe("bank");
  });

  it("every request is POST to an allowlisted path on the sandbox host", async () => {
    const { p, calls } = harness({
      "/accounts/balance/get": () => ({ accounts: [], item: {} }),
      "/transactions/sync": () => ({ added: [], modified: [], removed: [], next_cursor: "", has_more: false }),
      "/transactions/recurring/get": () => ({}),
      "/institutions/search": () => ({ institutions: [] }),
      "/link/token/create": () => ({ link_token: "link-test", expiration: "x" }),
    });
    await p.listAccounts();
    await p.listTransactions({ startDate: "2026-01-01", endDate: "2026-12-31" });
    await p.getRecurring();
    await p.searchInstitutions("x");
    await p.requestLinkToken("u1");
    expect(calls.length).toBe(5);
    for (const c of calls) {
      const u = new URL(c.url);
      expect(u.host).toBe("sandbox.plaid.com");
      expect(c.method).toBe("POST");
      expect((ALLOWED_PLAID_ENDPOINTS as readonly string[]).includes(u.pathname)).toBe(true);
    }
  });

  it("throws NoLinkedItemsError without access tokens, before any network", async () => {
    const { p, calls } = harness({}, []);
    await expect(p.listAccounts()).rejects.toBeInstanceOf(NoLinkedItemsError);
    await expect(p.listTransactions({ startDate: "a", endDate: "b" })).rejects.toBeInstanceOf(NoLinkedItemsError);
    await expect(p.getRecurring()).rejects.toBeInstanceOf(NoLinkedItemsError);
    expect(calls).toHaveLength(0);
  });

  it("surfaces Plaid errors without leaking credentials", async () => {
    const { p } = harness({ "/accounts/balance/get": () => new Error("item login required") });
    const err = await p.listAccounts().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlaidApiError);
    expect((err as Error).message).toContain("item login required");
    expect((err as Error).message).not.toContain("test-secret-value");
    expect((err as Error).message).not.toContain("tok-1");
  });

  it("exchanges a public token via the allowlisted endpoint", async () => {
    const { p, calls } = harness({ "/item/public_token/exchange": () => ({ access_token: "access-test-token", item_id: "item-1" }) });
    expect(await p.exchangePublicToken("public-test-token")).toEqual({ accessToken: "access-test-token", itemId: "item-1" });
    expect(new URL(calls[0]!.url).pathname).toBe("/item/public_token/exchange");
  });

  it("never touches global fetch when a transport is injected", async () => {
    const { p } = harness({ "/accounts/balance/get": () => ({ accounts: [], item: {} }) });
    const spy = vi.spyOn(globalThis, "fetch");
    await p.listAccounts();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
