import { describe, expect, it } from "vitest";
import { MockProvider, ToolInputError, runTool } from "../src/index.js";
import { parseFlags } from "../src/cli.js";

const p = new MockProvider();

describe("tool runner", () => {
  it("runs every no-arg read tool on mock data", async () => {
    expect((await runTool(p, "list_accounts") as unknown[]).length).toBe(5);
    expect((await runTool(p, "get_balances", { accountIds: ["acc_sav"] }) as unknown[]).length).toBe(1);
    expect((await runTool(p, "list_institutions", { limit: 3 }) as unknown[]).length).toBe(3);
    expect((await runTool(p, "search_institutions", { query: "fidelity" }) as unknown[]).length).toBe(1);
    expect((await runTool(p, "get_recurring") as unknown[]).length).toBeGreaterThan(5);
    expect((await runTool(p, "net_worth") as { netWorthCents: number }).netWorthCents).toBe(542_317 + 1_825_000 + 4_261_530 - 128_466 - 1_840_000);
  });

  it("lists transactions by window", async () => {
    const week = (await runTool(p, "list_transactions", { days: 7 })) as Array<{ date: string }>;
    expect(week.every((t) => t.date >= "2026-09-25" && t.date <= "2026-10-01")).toBe(true);
    const acct = (await runTool(p, "list_transactions", { accountIds: ["acc_cc"] })) as Array<{ accountId: string }>;
    expect(acct.every((t) => t.accountId === "acc_cc")).toBe(true);
  });

  it("budget_status uses explicit limits or a suggestion", async () => {
    const r = (await runTool(p, "budget_status", { month: "2026-09", limitsCents: { housing: 100 } })) as { report: { overCategories: string[] } };
    expect(r.report.overCategories).toEqual(["housing"]);
    const s = (await runTool(p, "budget_status", {})) as { budget: { month: string; limitsCents: Record<string, number> } };
    expect(s.budget.month).toBe("2026-10");
    expect(s.budget.limitsCents.housing).toBe(185_000);
  });

  it("spending_summary and detect_recurring return structured data", async () => {
    const s = (await runTool(p, "spending_summary", { topMerchants: 2 })) as { topMerchants: unknown[]; byCategory: unknown[]; monthlyTrend: unknown[] };
    expect(s.topMerchants).toHaveLength(2);
    expect(s.byCategory.length).toBeGreaterThan(5);
    expect(s.monthlyTrend).toHaveLength(4);
    const r = (await runTool(p, "detect_recurring", {})) as { items: unknown[]; estimatedMonthlyRecurringOutflowCents: number };
    expect(r.items.length).toBeGreaterThanOrEqual(8);
    expect(r.estimatedMonthlyRecurringOutflowCents).toBeGreaterThan(200_000);
  });

  it("goal tools work", async () => {
    const g = { targetCents: 1_200_000, targetDate: "2027-10-01" };
    expect(await runTool(p, "goal_required_contribution", g)).toEqual({ requiredMonthlyContributionCents: 100_000 });
    expect(await runTool(p, "goal_projection", { ...g, monthlyContributionCents: 100_000 })).toMatchObject({ onTrack: true });
    const w = (await runTool(p, "goal_what_if", { ...g, monthlyContributionCents: 50_000, scenarios: [{ label: "double", monthlyContributionCents: 100_000 }] })) as unknown[];
    expect(w).toHaveLength(2);
  });

  it("validates input", async () => {
    await expect(runTool(p, "nope")).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "search_institutions", {})).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "list_transactions", { days: 0 })).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "list_transactions", { days: "x" })).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "budget_status", { limitsCents: { bogus: 1 } })).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "budget_status", { limitsCents: { dining: -1 } })).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "goal_what_if", { targetCents: 1, targetDate: "2027-01-01", monthlyContributionCents: 1 })).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "place_order", {})).rejects.toBeInstanceOf(ToolInputError);
    await expect(runTool(p, "transfer_funds", {})).rejects.toBeInstanceOf(ToolInputError);
  });
});

describe("cli flag parsing", () => {
  it("parses numbers, json and camelCases flags", () => {
    expect(parseFlags(["--days", "30", "--target-cents", "500", "--limits-cents", '{"dining":1}', "--name", "x y", "--flag"])).toEqual({
      days: 30, targetCents: 500, limitsCents: { dining: 1 }, name: "x y", flag: true,
    });
  });
});
