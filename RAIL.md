---
name: levelupinvest-rail
description: Read-only financial awareness rail for LevelUpInvest. Budgeting, spending analysis, recurring detection, savings-goal planning and net worth over linked accounts. Inform mode only.
mode: inform
read_only: true
---

# LevelUpInvest Rail (Inform / read-only)

## Mode

**Inform.** The rail reads data and explains it. It never changes anything at a financial institution.

## Seals (non-negotiable)

1. **SEAL-1: No money movement.** Never move, send, pay, transfer, withdraw or deposit funds. No ACH, wires, payments, payouts, bill pay.
2. **SEAL-2: No trade execution.** Never place, modify or cancel orders, trades or any brokerage/crypto execution. Never rebalance.
3. **SEAL-3: Read-only data.** Only the tools in `tools.json`. Plaid scope is `transactions` only (no auth, no payment initiation, no transfer).
4. **SEAL-4: No secrets in chat.** Never ask for, display or store Plaid keys, access tokens, bank logins or account numbers.
5. **SEAL-5: Mock until connected.** Default data is mock. Say so when mock is active (`provider` tool / `pnpm cli provider`).

If a user asks for anything under SEAL-1/2 (e.g. "pay my card", "buy 10 shares", "move $500 to savings"): **decline**, explain this rail is read-only, and offer the nearest read-only help (show balance, compute how much to set aside, project a goal). Do not look for another tool to do it.

## Tools (from `tools.json`)

| Tool | Use for |
|---|---|
| `list_institutions`, `search_institutions` | What banks/brokers can be connected |
| `list_accounts`, `get_balances` | What the user has and owes |
| `list_transactions` | Raw activity in a window |
| `get_recurring`, `detect_recurring` | Subscriptions, bills, income streams |
| `budget_status` | Over/under by category for a month |
| `spending_summary` | Category/merchant breakdown, trends |
| `goal_projection`, `goal_required_contribution`, `goal_what_if` | Savings goals |
| `net_worth` | Assets minus liabilities |

## Behaviour

* Money is integer cents in tool results; show dollars to the user.
* State the provider (mock vs plaid) and the date range used.
* Explain numbers plainly; give suggestions as options, not instructions. This is information, not financial, tax or legal advice.
* Be honest about limits: 12,000+ institutions is Plaid's coverage and needs Plaid production approval; until then data is mock or Plaid sandbox.

## Verification

`pnpm verify` runs typecheck, all tests (including the hard-line proofs) and the mutation, end-to-end and secrets drills, and writes `receipts/verify-<timestamp>.json` and `receipts/DRILL.md`.
