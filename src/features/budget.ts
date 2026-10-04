import { addMonthsToMonth, daysInMonth, monthOf } from "../dates.js";
import { CATEGORIES, type Category, type Transaction } from "../types.js";
import { isSpend } from "./spending.js";

export interface Budget {
  /** 'YYYY-MM' */
  month: string;
  limitsCents: Partial<Record<Category, number>>;
}

export interface BudgetLine {
  category: Category;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  status: "under" | "at_limit" | "over";
}

export interface BudgetReport {
  month: string;
  lines: BudgetLine[];
  totalLimitCents: number;
  totalSpentCents: number;
  totalRemainingCents: number;
  overCategories: Category[];
  /** Spend in categories that have no limit set. */
  unbudgetedSpendCents: number;
  /** Linear projection of month-end spend; null unless asOf falls inside the month. */
  projectedMonthEndSpendCents: number | null;
  status: "under" | "at_limit" | "over";
}

export function spendByCategoryForMonth(txs: Transaction[], month: string): Map<Category, number> {
  const m = new Map<Category, number>();
  for (const t of txs) {
    if (t.pending || !isSpend(t) || monthOf(t.date) !== month) continue;
    m.set(t.category, (m.get(t.category) ?? 0) + t.amountCents);
  }
  return m;
}

export function evaluateBudget(txs: Transaction[], budget: Budget, asOf?: string): BudgetReport {
  const spent = spendByCategoryForMonth(txs, budget.month);
  const lines: BudgetLine[] = [];
  for (const category of CATEGORIES) {
    const limit = budget.limitsCents[category];
    if (limit === undefined) continue;
    const s = spent.get(category) ?? 0;
    lines.push({
      category,
      limitCents: limit,
      spentCents: s,
      remainingCents: limit - s,
      percentUsed: limit > 0 ? Math.round((s / limit) * 10_000) / 10_000 : s > 0 ? 1 : 0,
      status: s > limit ? "over" : s === limit ? "at_limit" : "under",
    });
  }
  const totalLimit = lines.reduce((x, l) => x + l.limitCents, 0);
  const totalSpent = lines.reduce((x, l) => x + l.spentCents, 0);
  let unbudgeted = 0;
  for (const [c, v] of spent) if (budget.limitsCents[c] === undefined) unbudgeted += v;
  let projected: number | null = null;
  if (asOf && monthOf(asOf) === budget.month) {
    const dom = Number(asOf.slice(8, 10));
    const all = totalSpent + unbudgeted;
    projected = Math.round((all / dom) * daysInMonth(budget.month));
  }
  return {
    month: budget.month,
    lines,
    totalLimitCents: totalLimit,
    totalSpentCents: totalSpent,
    totalRemainingCents: totalLimit - totalSpent,
    overCategories: lines.filter((l) => l.status === "over").map((l) => l.category),
    unbudgetedSpendCents: unbudgeted,
    projectedMonthEndSpendCents: projected,
    status: totalSpent > totalLimit ? "over" : totalSpent === totalLimit ? "at_limit" : "under",
  };
}

/** Months fully covered by the transaction data. */
export function completeMonths(txs: Transaction[]): string[] {
  if (txs.length === 0) return [];
  const dates = txs.map((t) => t.date).sort();
  const first = dates[0] as string;
  const last = dates[dates.length - 1] as string;
  const months = [...new Set(dates.map(monthOf))].sort();
  return months.filter((m) => first <= `${m}-01` && last >= `${m}-${String(daysInMonth(m)).padStart(2, "0")}`);
}

/**
 * Suggest limits from the average of up to `lookback` complete months strictly
 * before `month`, rounded up to the next $5.
 */
export function suggestBudget(txs: Transaction[], month: string, lookback = 3): Budget {
  const prior = completeMonths(txs)
    .filter((m) => m < month)
    .slice(-lookback);
  const totals = new Map<Category, number>();
  for (const m of prior) for (const [c, v] of spendByCategoryForMonth(txs, m)) totals.set(c, (totals.get(c) ?? 0) + v);
  const limitsCents: Partial<Record<Category, number>> = {};
  if (prior.length > 0) {
    for (const [c, v] of totals) {
      const avg = v / prior.length;
      if (avg > 0) limitsCents[c] = Math.ceil(avg / 500) * 500;
    }
  }
  return { month, limitsCents };
}

export function previousMonth(month: string): string {
  return addMonthsToMonth(month, -1);
}
