import type {
  Account,
  Balance,
  Institution,
  Page,
  RecurringItem,
  Transaction,
  TransactionQuery,
} from "../types.js";

/**
 * HARD LINE: this interface is READ-ONLY. It must never gain a method that
 * changes anything at a financial institution. tests/ prove it.
 */
export interface AggregationProvider {
  readonly name: "mock" | "plaid";
  listInstitutions(page?: Page): Promise<Institution[]>;
  searchInstitutions(query: string, page?: Page): Promise<Institution[]>;
  listAccounts(): Promise<Account[]>;
  getBalances(accountIds?: string[]): Promise<Balance[]>;
  listTransactions(query: TransactionQuery): Promise<Transaction[]>;
  getRecurring(): Promise<RecurringItem[]>;
}

/** The only method names a provider may expose (besides Plaid link helpers below). */
export const READ_METHODS = [
  "listInstitutions",
  "searchInstitutions",
  "listAccounts",
  "getBalances",
  "listTransactions",
  "getRecurring",
] as const;
