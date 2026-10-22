# LevelUpInvest Web — subscription SaaS (Phase 1, TEST/SANDBOX only)

Next.js 16 (App Router) app that wraps the read-only rail in `../src` as a subscription product.

> **Phase 1 status:** Stripe **test mode** and Plaid **sandbox** only. Live Stripe keys are refused in code
> (`assertTestModeKey`) unless `STRIPE_ALLOW_LIVE=true`; Plaid `production` is refused in `sandboxClient`.
> Pricing, legal pages and plan contents are **placeholders**.

## Architecture

| Concern | Choice | Where |
|---|---|---|
| Hosting | Vercel, Root Directory `web` (rail files in `../src` are bundled; keep "Include files outside root" on) | `next.config.ts` |
| Auth | Auth.js v5, passwordless email magic link via Resend, database sessions | `src/auth.ts` |
| Database | Postgres (e.g. Neon via Vercel Marketplace) + Drizzle ORM; migrations in `drizzle/` | `src/db/*` |
| Billing | Stripe Checkout (subscription mode) + Customer Portal; prices from env only | `src/lib/billing.ts` |
| Webhooks | Raw-body signature verification, event-id idempotency, re-fetch subscription to converge | `src/lib/webhook.ts`, `app/api/stripe/webhook` |
| Entitlements | Plan derived only from webhook-synced subscription (`active`/`trialing`; `past_due` until period end) | `src/lib/entitlements.ts` |
| Plaid | Rail's allowlisted `PlaidClient` (read-only endpoints, `transactions` product only), Link via CDN script | `src/lib/plaid.ts` |
| Token storage | AES-256-GCM, per-ciphertext key id (rotation), userId bound as AAD | `src/lib/crypto.ts` |
| Isolation | Every repo method is userId-scoped; provider built from the caller's items only | `src/lib/repo.ts`, `src/db/repo.ts` |

### Why Auth.js + email magic link
Standard, open-source, no per-user vendor fees, works natively with Next.js and the Drizzle adapter, stores no
passwords, and adding Google/Apple OAuth later is a one-line provider. Alternatives (Clerk, Supabase Auth) are
fine but add a vendor and pricing. Decision for Level Up Inc: keep or swap.

### Plans (placeholder)
| | Free | Pro |
|---|---|---|
| Mock-data budgeting/spending/goals/net worth | ✓ | ✓ |
| Link banks (Plaid) | – | up to 5 items |
| Insights over own data, recurring detection | – | ✓ |

### Billing vs the rail's seals
Stripe is used **only** to sell the subscription to this software (Checkout, Portal, webhooks). The product
itself still never moves a user's money or places trades; the rail's hard-line tests (root `pnpm test`) still
pass unchanged, and the Stripe SDK lives only in `web/`, never in the rail package.

## Local setup
```bash
cd web && pnpm install
cp .env.example .env.local   # fill values locally; NEVER commit
pnpm db:migrate
pnpm dev
stripe listen --forward-to localhost:3000/api/stripe/webhook   # gives a test whsec_ for STRIPE_WEBHOOK_SECRET
```
Stripe: create a **sandbox** (recommended) or use test mode, create a "Pro" product with monthly/yearly recurring
prices, put their IDs in `STRIPE_PRICE_PRO_*`, enable the Customer Portal, and use a restricted `rk_test_` key
with write access to Customers, Checkout Sessions, Customer Portal and read access to Subscriptions.
Webhook endpoint `/api/stripe/webhook` events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.created|updated|deleted|paused|resumed`, `invoice.paid`, `invoice.payment_failed`.

## Tests
`pnpm test` (35 tests): entitlements, encryption, live-key guard, checkout/portal params, webhook signature +
idempotency + lifecycle, Plaid gating/limits/encryption, cross-user isolation, hygiene scans. `pnpm build` needs no secrets.

## Not done in Phase 1
Account deletion/data export, Plaid webhooks + item re-auth, rate limiting, Stripe Tax, email templates, analytics,
production Plaid, live Stripe, final legal text.
