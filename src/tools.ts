import { addDays, monthOf, todayUtc } from "./dates.js";
import { evaluateBudget, suggestBudget, type Budget } from "./features/budget.js";
import { projectGoal, requiredMonthlyContribution, whatIf, type Goal, type Scenario } from "./features/goals.js";
import { netWorth } from "./features/networth.js";
import {
  averageDailySpend,
  detectRecurring,
  monthlyTrend,
  recurringMonthlyCost,
  spendingByCategory,
  spendingByMerchant,
} from "./features/spending.js";
import { MockProvider } from "./providers/mock.js";
import type { AggregationProvider } from "./providers/types.js";
import { CATEGORIES, type Category } from "./types.js";

type Args = Record<string, unknown>;

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(provider: AggregationProvider, args: Args): Promise<unknown>;
}

function resolveAsOf(provider: AggregationProvider, args: Args): string {
  if (typeof args.asOf === "string") return args.asOf;
  return provider instanceof MockProvider ? provider.asOf : todayUtc();
}

function optStr(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new ToolInputError(`${key} must be a string`);
  return v;
}

function reqStr(args: Args, key: string): string {
  const v = optStr(args, key);
  if (!v) throw new ToolInputError(`${key} is required`);
  return v;
}

function optNum(args: Args, key: string): number | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ToolInputError(`${key} must be a number`);
  return v;
}

function reqNum(args: Args, key: string): number {
  const v = optNum(args, key);
  if (v === undefined) throw new ToolInputError(`${key} is required`);
  return v;
}

function optStrArray(args: Args, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ToolInputError(`${key} must be string[]`);
  return v as string[];
}

function window(provider: AggregationProvider, args: Args): { startDate: string; endDate: string; asOf: string } {
  const asOf = resolveAsOf(provider, args);
  const days = optNum(args, "days") ?? 90;
  if (days < 1 || days > 730) throw new ToolInputError("days must be between 1 and 730");
  return { startDate: optStr(args, "startDate") ?? addDays(asOf, -(days - 1)), endDate: optStr(args, "endDate") ?? asOf, asOf };
}

function readGoal(args: Args): Goal {
  const goal: Goal = {
    name: optStr(args, "name") ?? "Goal",
    targetCents: reqNum(args, "targetCents"),
    currentCents: optNum(args, "currentCents") ?? 0,
    targetDate: reqStr(args, "targetDate"),
  };
  const r = optNum(args, "annualReturn");
  if (r !== undefined) goal.annualReturn = r;
  return goal;
}

const goalProps = {
  name: { type: "string" },
  targetCents: { type: "integer", minimum: 1, description: "Goal amount in cents" },
  currentCents: { type: "integer", minimum: 0, description: "Already saved, in cents" },
  targetDate: { type: "string", description: "YYYY-MM-DD" },
  annualReturn: { type: "number", description: "Nominal annual return, e.g. 0.04" },
  asOf: { type: "string", description: "YYYY-MM-DD; defaults to today (or the mock reference date)" },
};

const windowProps = {
  days: { type: "integer", minimum: 1, maximum: 730, description: "Lookback window, default 90" },
  startDate: { type: "string", description: "YYYY-MM-DD" },
  endDate: { type: "string", description: "YYYY-MM-DD" },
  asOf: { type: "string", description: "YYYY-MM-DD reference date" },
};

function obj(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

/** Every tool here is read-only. tools.json is generated from this list. */
export const TOOLS: ToolDef[] = [
  {
    name: "list_institutions",
    description: "List supported financial institutions (read-only).",
    inputSchema: obj({ limit: { type: "integer", minimum: 1 }, offset: { type: "integer", minimum: 0 } }),
    run: (p, a) => p.listInstitutions({ limit: optNum(a, "limit") ?? 50, offset: optNum(a, "offset") ?? 0 }),
  },
  {
    name: "search_institutions",
    description: "Search financial institutions by name (read-only).",
    inputSchema: obj({ query: { type: "string" }, limit: { type: "integer", minimum: 1 } }, ["query"]),
    run: (p, a) => p.searchInstitutions(reqStr(a, "query"), { limit: optNum(a, "limit") ?? 25 }),
  },
  {
    name: "list_accounts",
    description: "List linked accounts (read-only).",
    inputSchema: obj({}),
    run: (p) => p.listAccounts(),
  },
  {
    name: "get_balances",
    description: "Get current balances for linked accounts (read-only).",
    inputSchema: obj({ accountIds: { type: "array", items: { type: "string" } } }),
    run: (p, a) => p.getBalances(optStrArray(a, "accountIds")),
  },
  {
    name: "list_transactions",
    description: "List transactions in a date window (read-only).",
    inputSchema: obj({ ...windowProps, accountIds: { type: "array", items: { type: "string" } } }),
    run: async (p, a) => {
      const w = window(p, a);
      const ids = optStrArray(a, "accountIds");
      return p.listTransactions({ startDate: w.startDate, endDate: w.endDate, ...(ids ? { accountIds: ids } : {}) });
    },
  },
  {
    name: "get_recurring",
    description: "Get recurring income and expense streams reported by the provider (read-only).",
    inputSchema: obj({}),
    run: (p) => p.getRecurring(),
  },
  {
    name: "budget_status",
    description:
      "Evaluate a monthly budget (over/under per category). Pass limitsCents by category, or omit to use a suggested budget from past months.",
    inputSchema: obj({
      month: { type: "string", description: "YYYY-MM; defaults to month of asOf" },
      limitsCents: { type: "object", additionalProperties: { type: "integer", minimum: 0 }, description: `Keys: ${CATEGORIES.join(", ")}` },
      asOf: { type: "string" },
    }),
    run: async (p, a) => {
      const asOf = resolveAsOf(p, a);
      const month = optStr(a, "month") ?? monthOf(asOf);
      const txs = await p.listTransactions({ startDate: addDays(asOf, -179), endDate: asOf });
      let budget: Budget;
      if (a.limitsCents !== undefined) {
        const raw = a.limitsCents as Record<string, unknown>;
        const limitsCents: Partial<Record<Category, number>> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!(CATEGORIES as readonly string[]).includes(k)) throw new ToolInputError(`unknown category: ${k}`);
          if (typeof v !== "number" || v < 0) throw new ToolInputError(`limit for ${k} must be a non-negative number`);
          limitsCents[k as Category] = Math.round(v);
        }
        budget = { month, limitsCents };
      } else {
        budget = suggestBudget(txs, month);
      }
      return { budget, report: evaluateBudget(txs, budget, asOf) };
    },
  },
  {
    name: "spending_summary",
    description: "Spending by category and merchant, monthly trend, average daily spend.",
    inputSchema: obj({ ...windowProps, topMerchants: { type: "integer", minimum: 1, maximum: 50 } }),
    run: async (p, a) => {
      const w = window(p, a);
      const txs = await p.listTransactions({ startDate: w.startDate, endDate: w.endDate });
      return {
        startDate: w.startDate,
        endDate: w.endDate,
        byCategory: spendingByCategory(txs),
        topMerchants: spendingByMerchant(txs, optNum(a, "topMerchants") ?? 10),
        monthlyTrend: monthlyTrend(txs),
        averageDailySpendCents: averageDailySpend(txs, w.startDate, w.endDate),
      };
    },
  },
  {
    name: "detect_recurring",
    description: "Detect recurring charges/income from transaction history and estimate monthly cost.",
    inputSchema: obj(windowProps),
    run: async (p, a) => {
      const w = window(p, a);
      const items = detectRecurring(await p.listTransactions({ startDate: w.startDate, endDate: w.endDate }));
      return { items, estimatedMonthlyRecurringOutflowCents: recurringMonthlyCost(items) };
    },
  },
  {
    name: "goal_projection",
    description: "Project a savings goal given a monthly contribution.",
    inputSchema: obj({ ...goalProps, monthlyContributionCents: { type: "integer", minimum: 0 } }, [
      "targetCents",
      "targetDate",
      "monthlyContributionCents",
    ]),
    run: async (p, a) => projectGoal(readGoal(a), reqNum(a, "monthlyContributionCents"), resolveAsOf(p, a)),
  },
  {
    name: "goal_required_contribution",
    description: "Monthly contribution required to hit a savings goal by its target date.",
    inputSchema: obj(goalProps, ["targetCents", "targetDate"]),
    run: async (p, a) => ({
      requiredMonthlyContributionCents: requiredMonthlyContribution(readGoal(a), resolveAsOf(p, a)),
    }),
  },
  {
    name: "goal_what_if",
    description: "Compare what-if scenarios (contribution, return, date, lump sum) for a savings goal.",
    inputSchema: obj(
      {
        ...goalProps,
        monthlyContributionCents: { type: "integer", minimum: 0 },
        scenarios: {
          type: "array",
          items: obj(
            {
              label: { type: "string" },
              monthlyContributionCents: { type: "integer", minimum: 0 },
              annualReturn: { type: "number" },
              targetDate: { type: "string" },
              extraLumpSumCents: { type: "integer", minimum: 0 },
            },
            ["label"],
          ),
        },
      },
      ["targetCents", "targetDate", "monthlyContributionCents", "scenarios"],
    ),
    run: async (p, a) => {
      if (!Array.isArray(a.scenarios)) throw new ToolInputError("scenarios must be an array");
      return whatIf(readGoal(a), reqNum(a, "monthlyContributionCents"), resolveAsOf(p, a), a.scenarios as Scenario[]);
    },
  },
  {
    name: "net_worth",
    description: "Net worth summary from account balances (assets minus liabilities).",
    inputSchema: obj({}),
    run: async (p) => {
      const [accounts, balances] = await Promise.all([p.listAccounts(), p.getBalances()]);
      return netWorth(accounts, balances);
    },
  },
];

export const TOOL_NAMES: string[] = TOOLS.map((t) => t.name);

export async function runTool(provider: AggregationProvider, name: string, args: Args = {}): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolInputError(`Unknown tool: ${name}`);
  return tool.run(provider, args);
}

/** JSON document written to tools.json. */
export function buildToolsJson(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    rail: "levelupinvest-rail",
    mode: "inform",
    readOnly: true,
    notice: "Read-only rail: nothing exposed here changes any account.",
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      readOnly: true,
      input_schema: t.inputSchema,
    })),
  };
}
