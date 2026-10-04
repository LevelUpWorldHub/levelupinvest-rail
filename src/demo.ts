import { runTool } from "./tools.js";
import type { AggregationProvider } from "./providers/types.js";

/** End-to-end read-only run: budgeting, spending, goals, net worth. */
export async function runDemo(provider: AggregationProvider): Promise<Record<string, unknown>> {
  const budget = await runTool(provider, "budget_status", {
    month: "2026-09",
    limitsCents: {
      housing: 185_000,
      groceries: 50_000,
      dining: 30_000,
      transportation: 25_000,
      utilities: 25_000,
      subscriptions: 5_000,
      shopping: 30_000,
      health: 10_000,
      entertainment: 5_000,
      debt: 31_200,
    },
  });
  const spending = await runTool(provider, "spending_summary", { days: 90, topMerchants: 5 });
  const recurring = await runTool(provider, "detect_recurring", { days: 90 });
  const goalArgs = { name: "Emergency fund", targetCents: 3_000_000, currentCents: 1_825_000, targetDate: "2027-10-01", annualReturn: 0.04 };
  const required = await runTool(provider, "goal_required_contribution", goalArgs);
  const projection = await runTool(provider, "goal_projection", { ...goalArgs, monthlyContributionCents: 90_000 });
  const scenarios = await runTool(provider, "goal_what_if", {
    ...goalArgs,
    monthlyContributionCents: 90_000,
    scenarios: [
      { label: "save $1,200/mo", monthlyContributionCents: 120_000 },
      { label: "extra $2,000 lump sum", extraLumpSumCents: 200_000 },
    ],
  });
  const netWorth = await runTool(provider, "net_worth");
  return { provider: provider.name, budget, spending, recurring, goal: { required, projection, scenarios }, netWorth };
}
