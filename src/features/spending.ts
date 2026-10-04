import { daysBetween, addDays, addMonthsToMonth, daysInMonth, monthOf } from "../dates.js";
import type { Category, Frequency, RecurringItem, Transaction } from "../types.js";

/** Spend = outflows in non-income categories (refunds net against spend). */
export function isSpend(t: Transaction): boolean {
  return t.category !== "income";
}

export function isIncome(t: Transaction): boolean {
  return t.category === "income" && t.amountCents < 0;
}

export interface CategorySpend {
  category: Category;
  totalCents: number;
  count: number;
  share: number;
}

export function spendingByCategory(txs: Transaction[]): CategorySpend[] {
  const map = new Map<Category, { total: number; count: number }>();
  for (const t of txs) {
    if (!isSpend(t) || t.pending) continue;
    const cur = map.get(t.category) ?? { total: 0, count: 0 };
    cur.total += t.amountCents;
    cur.count += 1;
    map.set(t.category, cur);
  }
  const total = [...map.values()].reduce((s, v) => s + Math.max(v.total, 0), 0);
  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      totalCents: v.total,
      count: v.count,
      share: total > 0 ? Math.round((Math.max(v.total, 0) / total) * 10_000) / 10_000 : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category));
}

export interface MerchantSpend {
  merchant: string;
  totalCents: number;
  count: number;
}

export function spendingByMerchant(txs: Transaction[], limit = 10): MerchantSpend[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    if (!isSpend(t) || t.pending) continue;
    const cur = map.get(t.merchant) ?? { total: 0, count: 0 };
    cur.total += t.amountCents;
    cur.count += 1;
    map.set(t.merchant, cur);
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, totalCents: v.total, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents || a.merchant.localeCompare(b.merchant))
    .slice(0, limit);
}

export interface MonthTrend {
  month: string;
  spendCents: number;
  incomeCents: number;
  netCents: number;
  /** True when the data does not cover the whole month. */
  partial: boolean;
  /** Change in spend vs previous month, as a fraction; null when not comparable. */
  spendChange: number | null;
}

export function monthlyTrend(txs: Transaction[]): MonthTrend[] {
  if (txs.length === 0) return [];
  const dates = txs.map((t) => t.date).sort();
  const first = dates[0] as string;
  const last = dates[dates.length - 1] as string;
  const months = new Map<string, { spend: number; income: number }>();
  for (const t of txs) {
    if (t.pending) continue;
    const m = monthOf(t.date);
    const cur = months.get(m) ?? { spend: 0, income: 0 };
    if (isIncome(t)) cur.income += -t.amountCents;
    else if (isSpend(t)) cur.spend += t.amountCents;
    months.set(m, cur);
  }
  const keys = [...months.keys()].sort();
  const out: MonthTrend[] = [];
  let prev: MonthTrend | undefined;
  for (const m of keys) {
    const v = months.get(m) as { spend: number; income: number };
    const partial = !(first <= `${m}-01` && last >= `${m}-${String(daysInMonth(m)).padStart(2, "0")}`);
    const row: MonthTrend = {
      month: m,
      spendCents: v.spend,
      incomeCents: v.income,
      netCents: v.income - v.spend,
      partial,
      spendChange:
        prev && !prev.partial && !partial && prev.spendCents > 0 && addMonthsToMonth(prev.month, 1) === m
          ? Math.round(((v.spend - prev.spendCents) / prev.spendCents) * 10_000) / 10_000
          : null,
    };
    out.push(row);
    prev = row;
  }
  return out;
}

export function averageDailySpend(txs: Transaction[], startDate: string, endDate: string): number {
  const days = Math.max(1, daysBetween(startDate, endDate) + 1);
  const total = txs.reduce((s, t) => (isSpend(t) && !t.pending ? s + t.amountCents : s), 0);
  return Math.round(total / days);
}

function normalizeMerchant(m: string): string {
  return m.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

const CADENCES: Array<{ freq: Frequency; days: number; tol: number }> = [
  { freq: "weekly", days: 7, tol: 1 },
  { freq: "biweekly", days: 14, tol: 2 },
  { freq: "monthly", days: 30.5, tol: 4 },
  { freq: "annually", days: 365, tol: 7 },
];

/**
 * Heuristic recurring detection from raw transactions: >=3 occurrences at a
 * regular cadence with fairly stable amounts. Pure; works without provider support.
 */
export function detectRecurring(txs: Transaction[]): RecurringItem[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.pending) continue;
    const key = `${normalizeMerchant(t.merchant)}|${t.amountCents < 0 ? "in" : "out"}`;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }
  const out: RecurringItem[] = [];
  for (const [key, g] of groups) {
    if (g.length < 3) continue;
    const sorted = [...g].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween((sorted[i - 1] as Transaction).date, (sorted[i] as Transaction).date));
    }
    const med = median(gaps);
    const cadence = CADENCES.find((c) => Math.abs(med - c.days) <= c.tol);
    if (!cadence) continue;
    const regular = gaps.filter((x) => Math.abs(x - cadence.days) <= cadence.tol + 1).length / gaps.length;
    if (regular < 0.75) continue;
    const amounts = sorted.map((t) => Math.abs(t.amountCents));
    const mean = amounts.reduce((s, x) => s + x, 0) / amounts.length;
    const sd = Math.sqrt(amounts.reduce((s, x) => s + (x - mean) ** 2, 0) / amounts.length);
    if (mean === 0 || sd / mean > 0.2) continue;
    const last = sorted[sorted.length - 1] as Transaction;
    out.push({
      id: `det_${key.replace("|", "_")}`,
      accountId: last.accountId,
      merchant: last.merchant,
      description: last.name,
      category: last.category,
      frequency: cadence.freq,
      direction: last.amountCents < 0 ? "inflow" : "outflow",
      averageAmountCents: Math.round(mean),
      lastDate: last.date,
      nextDate: addDays(last.date, Math.round(cadence.days)),
      active: true,
      source: "detected",
    });
  }
  return out.sort((a, b) => b.averageAmountCents - a.averageAmountCents || a.merchant.localeCompare(b.merchant));
}

const MONTHLY_FACTOR: Record<Frequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semi_monthly: 2,
  monthly: 1,
  annually: 1 / 12,
  unknown: 0,
};

/** Approximate monthly cost of active recurring outflows. */
export function recurringMonthlyCost(items: RecurringItem[]): number {
  return Math.round(
    items
      .filter((i) => i.direction === "outflow" && i.active)
      .reduce((s, i) => s + i.averageAmountCents * MONTHLY_FACTOR[i.frequency], 0),
  );
}
