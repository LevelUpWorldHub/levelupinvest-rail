# Security

## Posture

This project is **read-only by construction**. It must never move money or execute trades. Reporting a way to make it do so is a security issue.

## Hard lines

* No transfers, payments, ACH, wires, payouts, payment initiation, processor tokens.
* No trade/order placement or brokerage execution of any kind.

Enforcement (all run in CI via `pnpm test`):

* The provider interface has only read methods; reflection test fails on any write-verb method.
* Plaid access goes through `PlaidClient`, which allows only `ALLOWED_PLAID_ENDPOINTS` and only HTTP `POST`; everything else throws `PlaidPolicyError` **before** any network call.
* Link tokens are minted with `products == ["transactions"]` only; any other set is rejected in code and by test.
* A static scan fails the build if forbidden identifiers/endpoints appear anywhere in `src/` or the manifest.
* A dependency test fails on any payment/brokerage SDK. The `plaid` SDK is deliberately not used.
* `tools.json` (the bot tool surface) is generated from code and tested to expose read tools only.
* Tests run with `fetch` stubbed to throw: tests can never reach the network.

## Secrets

* Required for live Plaid only: `PLAID_CLIENT_ID`, `PLAID_SECRET`, optional `PLAID_ACCESS_TOKENS`. They come from the environment only.
* `.env` is git-ignored; only `.env.example` (empty values) is committed. `tests/secrets.test.ts` scans the repo for token/key patterns.
* Credentials are held in private class fields, excluded from `toJSON`, and never included in error messages.
* Never paste credentials into chat, issues or PRs. If a secret is exposed, rotate it in the Plaid dashboard immediately.
* Enable GitHub secret scanning and push protection on the repository (see repo settings; availability on private repos depends on plan).

## Data handling

* Financial data is fetched on demand and not persisted by this repo.
* Plaid access tokens, once you have them, must live in a secret manager or encrypted store, scoped to the minimum service that needs them.
* The bot rail is **Inform** mode: it answers questions and shows numbers; it never acts on accounts.

## Reporting

Open a private security advisory on the repository or contact the repository owner directly.
