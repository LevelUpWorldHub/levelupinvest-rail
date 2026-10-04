import { addDays, addMonthsToDate, daysBetween, parseDate } from "../dates.js";
import type {
  Account,
  Balance,
  Category,
  Institution,
  Page,
  RecurringItem,
  Transaction,
  TransactionQuery,
} from "../types.js";
import type { AggregationProvider } from "./types.js";

export const MOCK_DEFAULT_AS_OF = "2026-10-01";
export const MOCK_DEFAULT_SEED = 20261004;
const WINDOW_DAYS = 90;

/** Small deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MOCK_INSTITUTIONS: Institution[] = [
  { id: "ins_mock_chase", name: "Mock Chase", country: "US", url: "https://example.com/chase" },
  { id: "ins_mock_ally", name: "Mock Ally Bank", country: "US", url: "https://example.com/ally" },
  { id: "ins_mock_capone", name: "Mock Capital One", country: "US", url: "https://example.com/capone" },
  { id: "ins_mock_fidelity", name: "Mock Fidelity", country: "US", url: "https://example.com/fidelity" },
  { id: "ins_mock_nelnet", name: "Mock Nelnet", country: "US", url: "https://example.com/nelnet" },
  { id: "ins_mock_boa", name: "Mock Bank of America", country: "US", url: "https://example.com/boa" },
  { id: "ins_mock_wells", name: "Mock Wells Fargo", country: "US", url: "https://example.com/wells" },
  { id: "ins_mock_schwab", name: "Mock Charles Schwab", country: "US", url: "https://example.com/schwab" },
];

export const MOCK_ACCOUNTS: Account[] = [
  { id: "acc_chk", institutionId: "ins_mock_chase", name: "Total Checking", mask: "0001", type: "depository", subtype: "checking" },
  { id: "acc_sav", institutionId: "ins_mock_ally", name: "Online Savings", mask: "0002", type: "depository", subtype: "savings" },
  { id: "acc_cc", institutionId: "ins_mock_capone", name: "Quicksilver Card", mask: "0003", type: "credit", subtype: "credit card" },
  { id: "acc_inv", institutionId: "ins_mock_fidelity", name: "Individual Investing", mask: "0004", type: "investment", subtype: "investment" },
  { id: "acc_loan", institutionId: "ins_mock_nelnet", name: "Student Loan", mask: "0005", type: "loan", subtype: "student" },
];

const BALANCES: Array<Omit<Balance, "currency" | "asOf">> = [
  { accountId: "acc_chk", currentCents: 542_317, availableCents: 542_317, limitCents: null },
  { accountId: "acc_sav", currentCents: 1_825_000, availableCents: 1_825_000, limitCents: null },
  { accountId: "acc_cc", currentCents: 128_466, availableCents: 871_534, limitCents: 1_000_000 },
  { accountId: "acc_inv", currentCents: 4_261_530, availableCents: null, limitCents: null },
  { accountId: "acc_loan", currentCents: 1_840_000, availableCents: null, limitCents: null },
];

interface MonthlyTemplate {
  key: string;
  day: number;
  merchant: string;
  name: string;
  minCents: number;
  maxCents: number;
  category: Category;
  accountId: string;
}

const MONTHLY: MonthlyTemplate[] = [
  { key: "rent", day: 1, merchant: "Maple Court Apartments", name: "MAPLE COURT APTS RENT", minCents: 185_000, maxCents: 185_000, category: "housing", accountId: "acc_chk" },
  { key: "internet", day: 8, merchant: "FiberNet", name: "FIBERNET INTERNET", minCents: 7_999, maxCents: 7_999, category: "utilities", accountId: "acc_chk" },
  { key: "power", day: 15, merchant: "City Power & Light", name: "CITY POWER AND LIGHT", minCents: 9_000, maxCents: 13_000, category: "utilities", accountId: "acc_chk" },
  { key: "gym", day: 5, merchant: "Iron Works Gym", name: "IRON WORKS GYM", minCents: 4_500, maxCents: 4_500, category: "health", accountId: "acc_chk" },
  { key: "loan", day: 25, merchant: "Nelnet Servicing", name: "NELNET LOAN SERVICING", minCents: 31_200, maxCents: 31_200, category: "debt", accountId: "acc_chk" },
  { key: "streaming", day: 12, merchant: "StreamFlix", name: "STREAMFLIX.COM", minCents: 1_549, maxCents: 1_549, category: "subscriptions", accountId: "acc_cc" },
  { key: "music", day: 20, merchant: "TuneBox", name: "TUNEBOX PREMIUM", minCents: 1_199, maxCents: 1_199, category: "subscriptions", accountId: "acc_cc" },
  { key: "interest", day: 28, merchant: "Mock Ally Bank", name: "INTEREST EARNED", minCents: -6_400, maxCents: -5_900, category: "income", accountId: "acc_sav" },
];

const PAYROLL_ANCHOR = "2026-07-10";

export interface MockOptions {
  seed?: number;
  asOf?: string;
  days?: number;
}

interface Fixtures {
  transactions: Transaction[];
  recurring: RecurringItem[];
}

function build(seed: number, asOf: string, days: number): Fixtures {
  const rng = prng(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;
  const raw: Omit<Transaction, "id">[] = [];
  const lastSeen = new Map<string, { date: string; amount: number }>();
  const add = (
    date: string,
    accountId: string,
    merchant: string,
    name: string,
    amountCents: number,
    category: Category,
    key?: string,
  ): void => {
    raw.push({ accountId, date, name, merchant, amountCents, category, pending: false });
    if (key) lastSeen.set(key, { date, amount: amountCents });
  };

  const start = addDays(asOf, -(days - 1));
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dom = Number(date.slice(8, 10));
    const dow = parseDate(date).getUTCDay();

    for (const t of MONTHLY) {
      if (t.day === dom) add(date, t.accountId, t.merchant, t.name, int(t.minCents, t.maxCents), t.category, t.key);
    }
    const sincePay = daysBetween(PAYROLL_ANCHOR, date);
    if (sincePay >= 0 && sincePay % 14 === 0) {
      add(date, "acc_chk", "Acme Corp", "ACME CORP PAYROLL", -285_000, "income", "payroll");
    }

    // Discretionary spending: draw the rng in a fixed sequence every day.
    const grocery = rng() < (dow === 6 || dow === 3 ? 0.65 : 0.12);
    const groceryAmt = int(3_000, 14_000);
    const groceryMerchant = pick(["Whole Foods", "Safeway", "Kroger"]);
    if (grocery) add(date, "acc_chk", groceryMerchant, groceryMerchant.toUpperCase(), groceryAmt, "groceries");

    const dineCount = rng() < (dow === 0 || dow === 6 ? 0.85 : 0.5) ? 1 : 0;
    const dineMerchant = pick(["Chipotle", "Starbucks", "Sweetgreen", "Local Pizza Co"]);
    const dineAmt = int(800, 6_500);
    if (dineCount) add(date, "acc_cc", dineMerchant, dineMerchant.toUpperCase(), dineAmt, "dining");

    const transit = rng() < 0.22;
    const transitIsGas = rng() < 0.5;
    const transitAmt = transitIsGas ? int(3_500, 6_500) : int(900, 3_200);
    if (transit) {
      if (transitIsGas) add(date, "acc_cc", "Shell", "SHELL OIL", transitAmt, "transportation");
      else add(date, "acc_cc", "Rideshare Co", "RIDESHARE CO TRIP", transitAmt, "transportation");
    }

    const shop = rng() < 0.16;
    const shopMerchant = pick(["Amazon", "Target", "Costco"]);
    const shopAmt = int(1_500, 18_000);
    if (shop) add(date, "acc_cc", shopMerchant, shopMerchant.toUpperCase(), shopAmt, "shopping");

    const health = rng() < 0.03;
    const healthAmt = int(1_200, 9_000);
    if (health) add(date, "acc_cc", "CVS Pharmacy", "CVS PHARMACY", healthAmt, "health");

    const fun = rng() < 0.04;
    const funAmt = int(1_500, 6_000);
    if (fun) add(date, "acc_cc", "Cineplex", "CINEPLEX TICKETS", funAmt, "entertainment");

    if (date === addDays(asOf, -48)) add(date, "acc_cc", "Skyline Airways", "SKYLINE AIRWAYS", 38_420, "travel");
  }

  raw.sort((a, b) => (a.date === b.date ? a.accountId.localeCompare(b.accountId) || a.name.localeCompare(b.name) : b.date.localeCompare(a.date)));
  const transactions: Transaction[] = raw.map((t, i) => ({ id: `txn_${String(i + 1).padStart(4, "0")}`, ...t }));

  const recurring: RecurringItem[] = [];
  const addRecurring = (
    key: string,
    accountId: string,
    merchant: string,
    description: string,
    category: Category,
    frequency: "monthly" | "biweekly",
    avg: number,
  ): void => {
    const seen = lastSeen.get(key);
    if (!seen) return;
    const next = frequency === "monthly" ? addMonthsToDate(seen.date, 1) : addDays(seen.date, 14);
    recurring.push({
      id: `rec_${key}`,
      accountId,
      merchant,
      description,
      category,
      frequency,
      direction: avg < 0 ? "inflow" : "outflow",
      averageAmountCents: Math.abs(avg),
      lastDate: seen.date,
      nextDate: next,
      active: true,
      source: "provider",
    });
  };
  addRecurring("payroll", "acc_chk", "Acme Corp", "ACME CORP PAYROLL", "income", "biweekly", -285_000);
  for (const t of MONTHLY) {
    addRecurring(t.key, t.accountId, t.merchant, t.name, t.category, "monthly", Math.round((t.minCents + t.maxCents) / 2));
  }
  return { transactions, recurring };
}

function paginate<T>(xs: T[], page?: Page): T[] {
  const offset = page?.offset ?? 0;
  const limit = page?.limit ?? xs.length;
  return xs.slice(offset, offset + limit);
}

/** Default provider: deterministic fixtures, zero network. */
export class MockProvider implements AggregationProvider {
  readonly name = "mock" as const;
  readonly asOf: string;
  readonly #fixtures: Fixtures;

  constructor(opts: MockOptions = {}) {
    this.asOf = opts.asOf ?? MOCK_DEFAULT_AS_OF;
    this.#fixtures = build(opts.seed ?? MOCK_DEFAULT_SEED, this.asOf, opts.days ?? WINDOW_DAYS);
  }

  async listInstitutions(page?: Page): Promise<Institution[]> {
    return paginate(structuredClone(MOCK_INSTITUTIONS), page);
  }

  async searchInstitutions(query: string, page?: Page): Promise<Institution[]> {
    const q = query.trim().toLowerCase();
    const hits = MOCK_INSTITUTIONS.filter((i) => i.name.toLowerCase().includes(q));
    return paginate(structuredClone(hits), page);
  }

  async listAccounts(): Promise<Account[]> {
    return structuredClone(MOCK_ACCOUNTS);
  }

  async getBalances(accountIds?: string[]): Promise<Balance[]> {
    return BALANCES.filter((b) => !accountIds || accountIds.includes(b.accountId)).map((b) => ({
      ...b,
      currency: "USD",
      asOf: this.asOf,
    }));
  }

  async listTransactions(query: TransactionQuery): Promise<Transaction[]> {
    return structuredClone(
      this.#fixtures.transactions.filter(
        (t) =>
          t.date >= query.startDate &&
          t.date <= query.endDate &&
          (!query.accountIds || query.accountIds.includes(t.accountId)),
      ),
    );
  }

  async getRecurring(): Promise<RecurringItem[]> {
    return structuredClone(this.#fixtures.recurring);
  }
}
