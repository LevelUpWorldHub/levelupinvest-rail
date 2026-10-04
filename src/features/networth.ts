import type { Account, AccountType, Balance } from "../types.js";

export interface NetWorthLine {
  accountId: string;
  name: string;
  type: AccountType;
  /** Signed contribution to net worth (liabilities are negative). */
  valueCents: number;
}

export interface NetWorthSummary {
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  byType: Partial<Record<AccountType, number>>;
  lines: NetWorthLine[];
}

const LIABILITY: ReadonlySet<AccountType> = new Set<AccountType>(["credit", "loan"]);

export function netWorth(accounts: Account[], balances: Balance[]): NetWorthSummary {
  const byId = new Map(balances.map((b) => [b.accountId, b]));
  const lines: NetWorthLine[] = [];
  let assets = 0;
  let liabilities = 0;
  const byType: Partial<Record<AccountType, number>> = {};
  for (const a of accounts) {
    const b = byId.get(a.id);
    if (!b) continue;
    const owed = LIABILITY.has(a.type);
    const value = owed ? -Math.abs(b.currentCents) : b.currentCents;
    if (owed) liabilities += Math.abs(b.currentCents);
    else assets += b.currentCents;
    byType[a.type] = (byType[a.type] ?? 0) + value;
    lines.push({ accountId: a.id, name: a.name, type: a.type, valueCents: value });
  }
  return { assetsCents: assets, liabilitiesCents: liabilities, netWorthCents: assets - liabilities, byType, lines };
}
