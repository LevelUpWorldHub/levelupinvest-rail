import { describe, expect, it } from "vitest";
import { MockProvider, MOCK_DEFAULT_AS_OF, addDays } from "../src/index.js";

describe("MockProvider", () => {
  const p = new MockProvider();

  it("is deterministic for the same seed and differs for another seed", async () => {
    const q = { startDate: "2026-01-01", endDate: "2026-12-31" };
    const a = await new MockProvider().listTransactions(q);
    const b = await new MockProvider().listTransactions(q);
    const c = await new MockProvider({ seed: 7 }).listTransactions(q);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("has several institutions, accounts of each type, and balances for every account", async () => {
    const inst = await p.listInstitutions();
    expect(inst.length).toBeGreaterThanOrEqual(6);
    const accts = await p.listAccounts();
    expect(new Set(accts.map((a) => a.type))).toEqual(new Set(["depository", "credit", "loan", "investment"]));
    const bal = await p.getBalances();
    expect(bal.map((b) => b.accountId).sort()).toEqual(accts.map((a) => a.id).sort());
    expect((await p.getBalances(["acc_chk"])).length).toBe(1);
    for (const a of accts) expect(inst.some((i) => i.id === a.institutionId)).toBe(true);
  });

  it("paginates and searches institutions", async () => {
    expect((await p.listInstitutions({ limit: 2 })).length).toBe(2);
    expect((await p.listInstitutions({ limit: 2, offset: 7 })).length).toBe(1);
    const hits = await p.searchInstitutions("chase");
    expect(hits.map((h) => h.name)).toEqual(["Mock Chase"]);
    expect(await p.searchInstitutions("zzzz")).toEqual([]);
  });

  it("covers 90 days of transactions ending at the reference date", async () => {
    const txs = await p.listTransactions({ startDate: "2000-01-01", endDate: "2100-01-01" });
    const dates = txs.map((t) => t.date).sort();
    expect(dates[0]! >= addDays(MOCK_DEFAULT_AS_OF, -89)).toBe(true);
    expect(dates[dates.length - 1]! <= MOCK_DEFAULT_AS_OF).toBe(true);
    expect(new Set(txs.map((t) => t.date)).size).toBeGreaterThan(70);
    expect(txs.length).toBeGreaterThan(140);
    expect(new Set(txs.map((t) => t.id)).size).toBe(txs.length);
  });

  it("filters transactions by date and account", async () => {
    const sep = await p.listTransactions({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(sep.every((t) => t.date.startsWith("2026-09"))).toBe(true);
    const chk = await p.listTransactions({ startDate: "2026-09-01", endDate: "2026-09-30", accountIds: ["acc_chk"] });
    expect(chk.length).toBeGreaterThan(0);
    expect(chk.every((t) => t.accountId === "acc_chk")).toBe(true);
  });

  it("returns recurring items with payroll inflow and rent outflow", async () => {
    const rec = await p.getRecurring();
    expect(rec.length).toBeGreaterThanOrEqual(8);
    expect(rec.find((r) => r.merchant === "Acme Corp")).toMatchObject({ direction: "inflow", frequency: "biweekly", averageAmountCents: 285_000 });
    expect(rec.find((r) => r.id === "rec_rent")).toMatchObject({ direction: "outflow", frequency: "monthly", averageAmountCents: 185_000 });
    for (const r of rec) expect(r.nextDate! > r.lastDate).toBe(true);
  });

  it("returns copies — callers cannot mutate fixtures", async () => {
    const a = await p.listAccounts();
    a[0]!.name = "HACKED";
    expect((await p.listAccounts())[0]!.name).not.toBe("HACKED");
  });

  it("makes no network calls", async () => {
    await p.listTransactions({ startDate: "2026-09-01", endDate: "2026-09-30" });
    // setup.ts replaces fetch with a thrower; reaching here proves it was never invoked.
    expect(true).toBe(true);
  });
});
