import { beforeAll, describe, expect, it } from "vitest";
import {
  MockProvider, addDays, addMonthsToDate, averageDailySpend, completeMonths, daysBetween, detectRecurring, evaluateBudget,
  futureValue, monthlyTrend, monthsBetween, netWorth, projectGoal, recurringMonthlyCost, requiredMonthlyContribution,
  spendingByCategory, spendingByMerchant, suggestBudget, whatIf, parseDate,
  type Transaction,
} from "../src/index.js";

const AS_OF = "2026-10-01";
let txs: Transaction[];
const mk = (date: string, amountCents: number, category: Transaction["category"], merchant = "M", pending = false): Transaction => ({
  id: `${date}-${merchant}-${amountCents}`, accountId: "a", date, name: merchant, merchant, amountCents, category, pending,
});

beforeAll(async () => {
  txs = await new MockProvider().listTransactions({ startDate: "2026-07-04", endDate: AS_OF });
});

describe("dates", () => {
  it("handles arithmetic and validation", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-09-01", "2026-10-01")).toBe(30);
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(monthsBetween("2026-10-01", "2027-10-01")).toBe(12);
    expect(monthsBetween("2026-10-15", "2027-10-01")).toBe(11);
    expect(monthsBetween("2027-01-01", "2026-01-01")).toBe(0);
    expect(() => parseDate("2026-02-30")).toThrow();
    expect(() => parseDate("nope")).toThrow();
  });
});

describe("budgeting", () => {
  it("computes over/under/at-limit per category", () => {
    const t = [mk("2026-09-02", 5000, "dining"), mk("2026-09-03", 6000, "dining"), mk("2026-09-04", 2000, "groceries"), mk("2026-09-05", 3000, "shopping"), mk("2026-08-05", 9999, "shopping"), mk("2026-09-06", -100000, "income")];
    const r = evaluateBudget(t, { month: "2026-09", limitsCents: { dining: 10000, groceries: 5000, shopping: 3000 } });
    const by = Object.fromEntries(r.lines.map((l) => [l.category, l]));
    expect(by.dining).toMatchObject({ spentCents: 11000, remainingCents: -1000, status: "over" });
    expect(by.groceries).toMatchObject({ spentCents: 2000, remainingCents: 3000, status: "under" });
    expect(by.shopping).toMatchObject({ spentCents: 3000, status: "at_limit" });
    expect(r.overCategories).toEqual(["dining"]);
    expect(r.totalSpentCents).toBe(16000);
    expect(r.totalLimitCents).toBe(18000);
    expect(r.status).toBe("under");
  });

  it("tracks unbudgeted spend, ignores income and pending, projects month end", () => {
    const t = [mk("2026-10-02", 3000, "dining"), mk("2026-10-03", 1000, "travel"), mk("2026-10-03", 999999, "shopping", "M", true), mk("2026-10-04", -500000, "income")];
    const r = evaluateBudget(t, { month: "2026-10", limitsCents: { dining: 5000 } }, "2026-10-10");
    expect(r.unbudgetedSpendCents).toBe(1000);
    expect(r.totalSpentCents).toBe(3000);
    expect(r.projectedMonthEndSpendCents).toBe(Math.round((4000 / 10) * 31));
    expect(evaluateBudget(t, { month: "2026-10", limitsCents: {} }, "2026-11-10").projectedMonthEndSpendCents).toBeNull();
  });

  it("refunds net against category spend", () => {
    const r = evaluateBudget([mk("2026-09-02", 10000, "shopping"), mk("2026-09-05", -4000, "shopping")], { month: "2026-09", limitsCents: { shopping: 7000 } });
    expect(r.lines[0]).toMatchObject({ spentCents: 6000, status: "under" });
  });

  it("suggests budgets from complete prior months, rounded up to $5", () => {
    expect(completeMonths(txs)).toEqual(["2026-08", "2026-09"]);
    const b = suggestBudget(txs, "2026-10");
    expect(b.limitsCents.housing).toBe(185_000);
    expect(b.limitsCents.income).toBeUndefined();
    for (const v of Object.values(b.limitsCents)) expect(v! % 500).toBe(0);
    expect(suggestBudget(txs, "2026-08").limitsCents).toEqual({});
  });

  it("mock September rent is exactly on budget and the report is internally consistent", () => {
    const r = evaluateBudget(txs, { month: "2026-09", limitsCents: { housing: 185_000, dining: 1 } });
    expect(r.lines.find((l) => l.category === "housing")!.status).toBe("at_limit");
    expect(r.lines.find((l) => l.category === "dining")!.status).toBe("over");
    expect(r.totalRemainingCents).toBe(r.totalLimitCents - r.totalSpentCents);
  });
});

describe("spending analysis", () => {
  it("groups by category with shares summing to ~1 and sorts descending", () => {
    const cats = spendingByCategory(txs);
    expect(cats[0]!.category).toBe("housing");
    expect(cats.map((c) => c.totalCents)).toEqual([...cats.map((c) => c.totalCents)].sort((a, b) => b - a));
    expect(cats.some((c) => c.category === "income")).toBe(false);
    expect(cats.reduce((s, c) => s + c.share, 0)).toBeGreaterThan(0.99);
    expect(cats.reduce((s, c) => s + c.share, 0)).toBeLessThan(1.01);
  });

  it("groups by merchant and honours the limit", () => {
    const m = spendingByMerchant(txs, 3);
    expect(m).toHaveLength(3);
    expect(m[0]!.merchant).toBe("Maple Court Apartments");
    expect(m[0]!.totalCents).toBe(555_000);
  });

  it("computes monthly trends with partial-month flags and changes", () => {
    const tr = monthlyTrend(txs);
    expect(tr.map((t) => [t.month, t.partial])).toEqual([["2026-07", true], ["2026-08", false], ["2026-09", false], ["2026-10", true]]);
    expect(tr[1]!.spendChange).toBeNull();
    const sep = tr[2]!;
    expect(sep.spendChange).toBe(Math.round(((sep.spendCents - tr[1]!.spendCents) / tr[1]!.spendCents) * 10_000) / 10_000);
    expect(sep.incomeCents).toBeGreaterThan(500_000);
    expect(sep.netCents).toBe(sep.incomeCents - sep.spendCents);
    expect(monthlyTrend([])).toEqual([]);
  });

  it("computes average daily spend", () => {
    const total = txs.filter((t) => t.category !== "income").reduce((s, t) => s + t.amountCents, 0);
    expect(averageDailySpend(txs, "2026-07-04", AS_OF)).toBe(Math.round(total / 90));
  });

  it("detects recurring charges and income from raw history", () => {
    const items = detectRecurring(txs);
    const byMerchant = Object.fromEntries(items.map((i) => [i.merchant, i]));
    for (const m of ["Maple Court Apartments", "Nelnet Servicing", "FiberNet", "City Power & Light", "Iron Works Gym", "StreamFlix", "TuneBox"]) {
      expect(byMerchant[m], m).toMatchObject({ frequency: "monthly", direction: "outflow", source: "detected" });
    }
    expect(byMerchant["Acme Corp"]).toMatchObject({ frequency: "biweekly", direction: "inflow", averageAmountCents: 285_000 });
    expect(byMerchant["Maple Court Apartments"]!.nextDate).toBe("2026-11-01");
    // discretionary merchants are not recurring
    for (const m of ["Chipotle", "Starbucks", "Whole Foods", "Amazon", "Shell", "Rideshare Co", "Skyline Airways"]) expect(byMerchant[m], m).toBeUndefined();
  });

  it("recurring detection agrees with provider-reported recurring streams", async () => {
    const reported = await new MockProvider().getRecurring();
    const detected = detectRecurring(txs);
    for (const r of reported) expect(detected.some((d) => d.merchant === r.merchant), r.merchant).toBe(true);
  });

  it("needs >=3 occurrences and stable amounts", () => {
    expect(detectRecurring([mk("2026-07-01", 1000, "other", "X"), mk("2026-08-01", 1000, "other", "X")])).toEqual([]);
    const varied = [mk("2026-07-01", 1000, "other", "Y"), mk("2026-08-01", 9000, "other", "Y"), mk("2026-09-01", 2500, "other", "Y")];
    expect(detectRecurring(varied)).toEqual([]);
    const irregular = [mk("2026-07-01", 1000, "other", "Z"), mk("2026-07-03", 1000, "other", "Z"), mk("2026-09-20", 1000, "other", "Z")];
    expect(detectRecurring(irregular)).toEqual([]);
  });

  it("estimates monthly recurring cost (biweekly income excluded)", () => {
    const cost = recurringMonthlyCost(detectRecurring(txs));
    expect(cost).toBe(185_000 + 31_200 + 7_999 + 10_868 + 4_500 + 1_549 + 1_199);
  });
});

describe("goal planning", () => {
  const goal = { name: "Trip", targetCents: 1_200_000, currentCents: 0, targetDate: "2027-10-01" };

  it("projects with zero return", () => {
    const p = projectGoal(goal, 100_000, AS_OF);
    expect(p).toMatchObject({ monthsToTarget: 12, projectedAtTargetDateCents: 1_200_000, shortfallCents: 0, onTrack: true, monthsUntilReached: 12, projectedCompletionDate: "2027-10-01" });
    const short = projectGoal(goal, 50_000, AS_OF);
    expect(short).toMatchObject({ projectedAtTargetDateCents: 600_000, shortfallCents: 600_000, onTrack: false });
    expect(short.monthsUntilReached).toBe(24);
  });

  it("never completes with no contribution and no return; already-met goals complete immediately", () => {
    expect(projectGoal(goal, 0, AS_OF).monthsUntilReached).toBeNull();
    expect(projectGoal(goal, 0, AS_OF).projectedCompletionDate).toBeNull();
    expect(projectGoal({ ...goal, currentCents: 1_300_000 }, 0, AS_OF)).toMatchObject({ monthsUntilReached: 0, onTrack: true });
  });

  it("required contribution with zero return is simple division", () => {
    expect(requiredMonthlyContribution(goal, AS_OF)).toBe(100_000);
    expect(requiredMonthlyContribution({ ...goal, currentCents: 600_000 }, AS_OF)).toBe(50_000);
    expect(requiredMonthlyContribution({ ...goal, currentCents: 2_000_000 }, AS_OF)).toBe(0);
    expect(requiredMonthlyContribution({ ...goal, targetDate: "2026-10-01" }, AS_OF)).toBe(1_200_000);
  });

  it("required contribution with returns is the minimal level contribution", () => {
    const g = { ...goal, currentCents: 100_000, annualReturn: 0.06 };
    const req = requiredMonthlyContribution(g, AS_OF);
    expect(req).toBeLessThan(100_000);
    expect(futureValue(g.currentCents, req, 0.06, 12)).toBeGreaterThanOrEqual(g.targetCents);
    expect(futureValue(g.currentCents, req - 1, 0.06, 12)).toBeLessThan(g.targetCents);
    expect(projectGoal(g, req, AS_OF).onTrack).toBe(true);
  });

  it("future value matches closed form", () => {
    expect(futureValue(100_000, 0, 0.12, 12)).toBe(Math.round(100_000 * 1.01 ** 12));
    expect(futureValue(0, 10_000, 0, 6)).toBe(60_000);
  });

  it("what-if compares scenarios against a baseline", () => {
    const res = whatIf({ ...goal, annualReturn: 0.04 }, 80_000, AS_OF, [
      { label: "more", monthlyContributionCents: 110_000 },
      { label: "lump", extraLumpSumCents: 300_000 },
      { label: "later", targetDate: "2028-10-01" },
    ]);
    expect(res.map((r) => r.label)).toEqual(["baseline", "more", "lump", "later"]);
    expect(res[1]!.projection.projectedAtTargetDateCents).toBeGreaterThan(res[0]!.projection.projectedAtTargetDateCents);
    expect(res[2]!.requiredMonthlyContributionCents).toBeLessThan(res[0]!.requiredMonthlyContributionCents);
    expect(res[3]!.requiredMonthlyContributionCents).toBeLessThan(res[0]!.requiredMonthlyContributionCents);
    expect(res[0]!.projection.onTrack).toBe(false);
    expect(res[1]!.projection.onTrack).toBe(true);
  });
});

describe("net worth", () => {
  it("sums assets minus liabilities from mock balances", async () => {
    const p = new MockProvider();
    const nw = netWorth(await p.listAccounts(), await p.getBalances());
    expect(nw.assetsCents).toBe(542_317 + 1_825_000 + 4_261_530);
    expect(nw.liabilitiesCents).toBe(128_466 + 1_840_000);
    expect(nw.netWorthCents).toBe(nw.assetsCents - nw.liabilitiesCents);
    expect(nw.byType.credit).toBe(-128_466);
    expect(nw.lines).toHaveLength(5);
  });

  it("ignores accounts without a balance and treats liabilities as negative regardless of sign", () => {
    const nw = netWorth(
      [{ id: "x", institutionId: "i", name: "X", mask: "", type: "loan", subtype: "" }, { id: "y", institutionId: "i", name: "Y", mask: "", type: "depository", subtype: "" }],
      [{ accountId: "x", currentCents: -500, availableCents: null, limitCents: null, currency: "USD", asOf: "" }],
    );
    expect(nw).toMatchObject({ assetsCents: 0, liabilitiesCents: 500, netWorthCents: -500 });
  });
});
