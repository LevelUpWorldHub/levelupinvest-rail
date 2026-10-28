import { spendingByCategory, detectRecurring, recurringMonthlyCost } from "@rail/features/spending";
import { netWorth } from "@rail/features/networth";
import type { AggregationProvider } from "@rail/providers/types";
import { can, type Plan } from "./entitlements";

/** Read-only summary for the dashboard. Pro-only sections are omitted on Free. */
export async function buildInsights(p: AggregationProvider, plan: Plan, startDate: string, endDate: string) {
  const [accounts, balances, txs] = await Promise.all([
    p.listAccounts(),
    p.getBalances(),
    p.listTransactions({ startDate, endDate }),
  ]);
  const recurring = can(plan, "recurring_detection") ? detectRecurring(txs) : null;
  return {
    provider: p.name,
    range: { startDate, endDate },
    netWorth: netWorth(accounts, balances),
    topCategories: spendingByCategory(txs).slice(0, 8),
    recurring: recurring ? { items: recurring.slice(0, 20), monthlyCostCents: recurringMonthlyCost(recurring) } : null,
  };
}
