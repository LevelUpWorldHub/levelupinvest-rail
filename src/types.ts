/** Domain types. Money is integer cents. Sign convention: positive = money out, negative = money in. */

export const CATEGORIES = [
  "income",
  "housing",
  "groceries",
  "dining",
  "transportation",
  "utilities",
  "subscriptions",
  "shopping",
  "health",
  "entertainment",
  "travel",
  "debt",
  "fees",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type AccountType = "depository" | "credit" | "loan" | "investment" | "other";

export interface Institution {
  id: string;
  name: string;
  country: string;
  url?: string;
}

export interface Account {
  id: string;
  institutionId: string;
  name: string;
  mask: string;
  type: AccountType;
  subtype: string;
}

/** For credit/loan accounts currentCents is the amount owed (positive). */
export interface Balance {
  accountId: string;
  currentCents: number;
  availableCents: number | null;
  limitCents: number | null;
  currency: string;
  asOf: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  name: string;
  merchant: string;
  amountCents: number;
  category: Category;
  pending: boolean;
}

export type Frequency = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "annually" | "unknown";

export interface RecurringItem {
  id: string;
  accountId: string | null;
  merchant: string;
  description: string;
  category: Category;
  frequency: Frequency;
  direction: "outflow" | "inflow";
  /** Positive magnitude in cents. */
  averageAmountCents: number;
  lastDate: string;
  nextDate: string | null;
  active: boolean;
  source: "provider" | "detected";
}

export interface TransactionQuery {
  startDate: string;
  endDate: string;
  accountIds?: string[];
}

export interface Page {
  limit?: number;
  offset?: number;
}
