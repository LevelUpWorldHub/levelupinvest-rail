# levelupinvest-rail

A **read-only** bot rail for LevelUpInvest: budgeting, spending analysis, goal planning and net-worth summaries over bank/card/loan/investment *data*.

> **No money movement. No trade execution.** These are structural hard lines, not settings. The code paths do not exist, and the test suite fails if anyone adds them. See [Hard lines](#hard-lines).

Runs on **deterministic mock data** by default. It talks to Plaid only if you explicitly provide Plaid credentials.

**Live demo (mock data only):** https://levelupinvest-rail-demo.vercel.app — budget, spending, recurring charges, goal what-ifs and net worth rendered from the built-in `MockProvider`. Nothing in the demo is real and no bank is connected.

## Who it's for

Builders of AI assistants or personal-finance bots who want safe, read-only money tools (budgeting, spending, goals, net worth) that work out of the box on mock data and can later read real accounts through Plaid, with tests that prove the bot can never move money or trade.

## Mock-data demo

```bash
pnpm install
pnpm demo:build      # writes demo/data.json from MockProvider (no network, no env vars)
npx serve demo       # or any static server, then open http://localhost:3000
```

`demo/` is a static site (`index.html` + `data.json`), so it can be hosted anywhere. It never uses Plaid.

## Quick start

```bash
pnpm install
pnpm test            # unit tests + hard-line proofs, zero network
pnpm typecheck
pnpm cli provider    # -> mock
pnpm cli demo        # budgeting + spending + goals + net worth on mock data
pnpm cli budget_status --month 2026-09 --limits-cents '{"dining":30000}'
pnpm cli goal_required_contribution --target-cents 3000000 --current-cents 1825000 --target-date 2027-10-01 --annual-return 0.04
pnpm verify          # tests + drills, writes receipts/verify-<timestamp>.json and receipts/DRILL.md
pnpm gen:tools       # regenerate tools.json from src/tools.ts
```

## What it does

| Area | Pure functions (`src/features/`) | Bot tools (`tools.json`) |
|---|---|---|
| Data | `AggregationProvider` (6 read methods) | `list_institutions`, `search_institutions`, `list_accounts`, `get_balances`, `list_transactions`, `get_recurring` |
| Budgeting | categories, monthly budgets, over/under, month-end projection, suggested budget | `budget_status` |
| Spending | by category / merchant, monthly trend, average daily spend, recurring detection | `spending_summary`, `detect_recurring` |
| Goals | projection, required monthly contribution, what-if scenarios | `goal_projection`, `goal_required_contribution`, `goal_what_if` |
| Net worth | assets − liabilities | `net_worth` |

Money is integer cents. Sign convention follows Plaid: positive = money out, negative = money in.

## Providers

* `MockProvider` (default): seeded fixtures — 8 institutions, 5 accounts (checking, savings, credit card, investment, student loan), 90 days of transactions, recurring items. No network, ever.
* `PlaidProvider`: **read-only**. Enabled **only** when `PLAID_CLIENT_ID` and `PLAID_SECRET` are set **and** `PLAID_ENV` is `sandbox` or `production`. Anything else → Mock.
  * Link token: products are exactly `["transactions"]` (no `auth`, no payment initiation, no transfer).
  * Endpoints (the entire allowlist, `ALLOWED_PLAID_ENDPOINTS`): `/link/token/create`, `/item/public_token/exchange`, `/accounts/balance/get`, `/transactions/sync`, `/institutions/search`, `/institutions/get`, `/transactions/recurring/get`.
  * It uses plain HTTPS `fetch`, **not** the `plaid` npm SDK (the SDK ships transfer/payment clients; we don't pull that code in at all).

> Note on the allowlist: beyond the five data endpoints you asked for, two supporting endpoints are allowlisted — `/item/public_token/exchange` (required to turn a Link `public_token` into an `access_token`) and `/institutions/get` (used by `listInstitutions`). Neither moves money; remove them in `src/plaid/allowlist.ts` if you prefer a stricter surface (the allowlist test will tell you what to update).

## Hard lines

1. **No money movement** — no transfers, payments, ACH, wires, payouts, payment initiation, processor tokens.
2. **No trade execution** — no orders, trades, brokerage execution, investment order APIs.

Enforced structurally and proven by tests (`tests/hardlines.*.test.ts`):

| Proof | Test file |
|---|---|
| (a) static scan of all of `src/` + manifest/config for forbidden identifiers and endpoints | `hardlines.static.test.ts` |
| (b) runtime reflection: provider interface and every exported class have no write-capable methods | `hardlines.runtime.test.ts` |
| (c) Plaid allowlist: any non-allowed path or HTTP method throws before any network call | `hardlines.allowlist.test.ts` |
| (d) `tools.json` exposes only read tools and matches the code | `hardlines.tools.test.ts` |
| (e) `package.json` / lockfile have no payment or brokerage SDKs | `hardlines.deps.test.ts` |
| (f) Link token request has `products == ['transactions']` and nothing forbidden | `hardlines.linktoken.test.ts` |

`pnpm verify` additionally runs a **mutation drill**: it injects forbidden changes (a `placeOrder` method, a `/transfer/create` endpoint, a `payment_initiation` product, a payment SDK, a write tool, a PUT method…) into a scratch copy and shows the suite goes red, then reverts and shows it goes green. Results: [`receipts/DRILL.md`](receipts/DRILL.md).

Honest scope of these proofs: they make it hard to add such code *accidentally or casually* and make any change obvious in CI. A determined maintainer can still edit the tests; keep branch protection/code review on `main`.

## Connecting Plaid (you must do this)

I (the build) do **not** have, ask for, or store Plaid credentials. To go live:

1. Create a Plaid developer account and copy `client_id` and the **Sandbox** `secret` from the Plaid dashboard.
2. Locally: `cp .env.example .env` and fill `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`. (`.env` is git-ignored. Never commit it, never paste it into chat.)
3. **Plaid Link must run inside your own app** (web or mobile). Your backend calls `PlaidProvider.requestLinkToken(userId)`; your frontend opens Plaid Link with that token; Link returns a `public_token`; your backend calls `exchangePublicToken(public_token)` and stores the resulting `access_token` securely (secret manager/encrypted store). Put access tokens in `PLAID_ACCESS_TOKENS` (comma-separated) for the CLI/bot. This repo ships no Link UI.
4. Start in **sandbox** (fake institutions, e.g. test credentials from Plaid's docs). Sandbox returns Plaid test data, not real accounts.
5. For **real institutions you need Plaid production access**: Plaid reviews and approves your application/use case, and some institutions (notably large banks using OAuth) require additional registration/approval. Pricing and approval terms are Plaid's — check your Plaid dashboard.

### About "12,000+ institutions"

That is **Plaid's** published coverage across supported countries — not something this repo provides or guarantees. This repo only reaches those institutions through Plaid, **after** you have Plaid production approval, and only for institutions Plaid supports for the `transactions` product in the countries you enable (this build requests `US`). Until then you get mock data (default) or Plaid sandbox test data.

## Known limitations

* Mock data is synthetic; it is not a model of anyone's real finances.
* Plaid categories that describe movements between a user's own accounts (and loan repayments) are not specially handled — they map to `other`, so spending totals on real data may include them. Fixing this needs a deliberately reviewed exception to the "no transfer/payment identifiers" scan.
* Plaid provider is unit-tested against a fake transport only; it has **not** been run against live Plaid (no credentials were used).
* No persistence: budgets and goals are passed in per call.
* Investments holdings/positions are not fetched (balances only).

## Layout

```
src/providers/   types.ts (read-only interface), mock.ts, plaid.ts, index.ts (selection)
src/plaid/       allowlist.ts (hard allowlist), client.ts (HTTP layer), map.ts
src/features/    budget.ts, spending.ts, goals.ts, networth.ts (pure)
src/tools.ts     tool registry -> tools.json
scripts/         verify.ts, gen-tools.ts
tests/           unit tests + hardlines.*.test.ts proofs
receipts/        verify-<timestamp>.json, DRILL.md
```

See also: [`SECURITY.md`](SECURITY.md), [`RAIL.md`](RAIL.md).

## License

MIT — see [LICENSE](LICENSE). Not financial advice.


## Subscription web app (Phase 1, test mode)

A Next.js SaaS wrapper lives in [`web/`](web/README.md): email magic-link sign-in, Stripe Checkout subscriptions (test mode only), Plaid Link (sandbox), encrypted token storage and per-user isolation. The rail in `src/` is unchanged and still read-only.
