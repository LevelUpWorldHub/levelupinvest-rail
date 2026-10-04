import { PlaidClient, buildLinkTokenRequest, type FetchLike, type PlaidConfig } from "../plaid/client.js";
import { mapAccountType, mapCategory, mapFrequency, toCents } from "../plaid/map.js";
import type {
  Account,
  Balance,
  Institution,
  Page,
  RecurringItem,
  Transaction,
  TransactionQuery,
} from "../types.js";
import type { AggregationProvider } from "./types.js";

interface PlaidAccountRaw {
  account_id: string;
  name?: string;
  mask?: string | null;
  type?: string;
  subtype?: string | null;
  balances?: {
    current?: number | null;
    available?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
  };
}

interface PlaidStreamRaw {
  stream_id: string;
  account_id?: string;
  description?: string;
  merchant_name?: string | null;
  frequency?: string;
  average_amount?: { amount?: number };
  last_date?: string;
  predicted_next_date?: string | null;
  is_active?: boolean;
  personal_finance_category?: { primary?: string; detailed?: string };
}

export class NoLinkedItemsError extends Error {
  constructor() {
    super("No Plaid access tokens configured (PLAID_ACCESS_TOKENS). Run Plaid Link in your app first.");
    this.name = "NoLinkedItemsError";
  }
}

const MAX_SYNC_PAGES = 50;

/** Read-only Plaid provider. Uses PlaidClient, which enforces the endpoint allowlist. */
export class PlaidProvider implements AggregationProvider {
  readonly name = "plaid" as const;
  readonly #client: PlaidClient;
  readonly #accessTokens: string[];

  constructor(config: PlaidConfig, opts: { fetchImpl?: FetchLike } = {}) {
    this.#client = new PlaidClient({
      clientId: config.clientId,
      secret: config.secret,
      env: config.env,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    this.#accessTokens = [...config.accessTokens];
  }

  toJSON(): { name: "plaid"; env: string; linkedItems: number } {
    return { name: this.name, env: this.#client.env, linkedItems: this.#accessTokens.length };
  }

  #tokens(): string[] {
    if (this.#accessTokens.length === 0) throw new NoLinkedItemsError();
    return this.#accessTokens;
  }

  /** Mints a Link token for the user's app. Products are fixed to ['transactions']. */
  async requestLinkToken(clientUserId: string): Promise<{ linkToken: string; expiration: string }> {
    const res = await this.#client.callReadEndpoint<{ link_token: string; expiration: string }>(
      "/link/token/create",
      { ...buildLinkTokenRequest(clientUserId) },
    );
    return { linkToken: res.link_token, expiration: res.expiration };
  }

  /** Exchanges the public token from Link. The caller must store the result securely (never in git). */
  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    const res = await this.#client.callReadEndpoint<{ access_token: string; item_id: string }>(
      "/item/public_token/exchange",
      { public_token: publicToken },
    );
    return { accessToken: res.access_token, itemId: res.item_id };
  }

  async listInstitutions(page?: Page): Promise<Institution[]> {
    const res = await this.#client.callReadEndpoint<{ institutions: Array<Record<string, unknown>> }>(
      "/institutions/get",
      { count: page?.limit ?? 50, offset: page?.offset ?? 0, country_codes: ["US"] },
    );
    return res.institutions.map(mapInstitution);
  }

  async searchInstitutions(query: string, page?: Page): Promise<Institution[]> {
    const res = await this.#client.callReadEndpoint<{ institutions: Array<Record<string, unknown>> }>(
      "/institutions/search",
      { query, products: ["transactions"], country_codes: ["US"] },
    );
    const all = res.institutions.map(mapInstitution);
    const offset = page?.offset ?? 0;
    return all.slice(offset, offset + (page?.limit ?? all.length));
  }

  async #fetchAccounts(): Promise<Array<{ account: Account; balance: Balance }>> {
    const out: Array<{ account: Account; balance: Balance }> = [];
    for (const accessToken of this.#tokens()) {
      const res = await this.#client.callReadEndpoint<{
        accounts: PlaidAccountRaw[];
        item?: { institution_id?: string | null };
      }>("/accounts/balance/get", { access_token: accessToken });
      const institutionId = res.item?.institution_id ?? "unknown";
      const asOf = new Date().toISOString();
      for (const a of res.accounts) {
        out.push({
          account: {
            id: a.account_id,
            institutionId,
            name: a.name ?? "Account",
            mask: a.mask ?? "",
            type: mapAccountType(a.type),
            subtype: a.subtype ?? "",
          },
          balance: {
            accountId: a.account_id,
            currentCents: toCents(a.balances?.current),
            availableCents: a.balances?.available == null ? null : toCents(a.balances.available),
            limitCents: a.balances?.limit == null ? null : toCents(a.balances.limit),
            currency: a.balances?.iso_currency_code ?? "USD",
            asOf,
          },
        });
      }
    }
    return out;
  }

  async listAccounts(): Promise<Account[]> {
    return (await this.#fetchAccounts()).map((x) => x.account);
  }

  async getBalances(accountIds?: string[]): Promise<Balance[]> {
    return (await this.#fetchAccounts())
      .map((x) => x.balance)
      .filter((b) => !accountIds || accountIds.includes(b.accountId));
  }

  async listTransactions(query: TransactionQuery): Promise<Transaction[]> {
    const byId = new Map<string, Transaction>();
    for (const accessToken of this.#tokens()) {
      let cursor: string | undefined;
      for (let page = 0; page < MAX_SYNC_PAGES; page++) {
        const res = await this.#client.callReadEndpoint<{
          added: PlaidTxRaw[];
          modified: PlaidTxRaw[];
          removed: Array<{ transaction_id: string }>;
          next_cursor: string;
          has_more: boolean;
        }>("/transactions/sync", { access_token: accessToken, count: 500, ...(cursor ? { cursor } : {}) });
        for (const t of [...res.added, ...res.modified]) byId.set(t.transaction_id, mapTransaction(t));
        for (const r of res.removed) byId.delete(r.transaction_id);
        cursor = res.next_cursor;
        if (!res.has_more) break;
      }
    }
    return [...byId.values()]
      .filter(
        (t) =>
          t.date >= query.startDate &&
          t.date <= query.endDate &&
          (!query.accountIds || query.accountIds.includes(t.accountId)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }

  async getRecurring(): Promise<RecurringItem[]> {
    const out: RecurringItem[] = [];
    for (const accessToken of this.#tokens()) {
      const res = await this.#client.callReadEndpoint<{
        inflow_streams?: PlaidStreamRaw[];
        outflow_streams?: PlaidStreamRaw[];
      }>("/transactions/recurring/get", { access_token: accessToken });
      for (const s of res.inflow_streams ?? []) out.push(mapStream(s, "inflow"));
      for (const s of res.outflow_streams ?? []) out.push(mapStream(s, "outflow"));
    }
    return out;
  }
}

interface PlaidTxRaw {
  transaction_id: string;
  account_id: string;
  date: string;
  name?: string;
  merchant_name?: string | null;
  amount: number;
  pending?: boolean;
  personal_finance_category?: { primary?: string; detailed?: string };
}

function mapInstitution(i: Record<string, unknown>): Institution {
  return {
    id: String(i.institution_id ?? ""),
    name: String(i.name ?? ""),
    country: Array.isArray(i.country_codes) ? String(i.country_codes[0] ?? "US") : "US",
    ...(typeof i.url === "string" ? { url: i.url } : {}),
  };
}

function mapTransaction(t: PlaidTxRaw): Transaction {
  return {
    id: t.transaction_id,
    accountId: t.account_id,
    date: t.date,
    name: t.name ?? "",
    merchant: t.merchant_name ?? t.name ?? "Unknown",
    amountCents: toCents(t.amount),
    category: mapCategory(t.personal_finance_category?.primary, t.personal_finance_category?.detailed),
    pending: t.pending ?? false,
  };
}

function mapStream(s: PlaidStreamRaw, direction: "inflow" | "outflow"): RecurringItem {
  return {
    id: s.stream_id,
    accountId: s.account_id ?? null,
    merchant: s.merchant_name ?? s.description ?? "Unknown",
    description: s.description ?? "",
    category: mapCategory(s.personal_finance_category?.primary, s.personal_finance_category?.detailed),
    frequency: mapFrequency(s.frequency),
    direction,
    averageAmountCents: Math.abs(toCents(s.average_amount?.amount)),
    lastDate: s.last_date ?? "",
    nextDate: s.predicted_next_date ?? null,
    active: s.is_active ?? true,
    source: "provider",
  };
}
