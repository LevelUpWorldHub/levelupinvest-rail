/**
 * HARD LINE: the ONLY Plaid endpoints this code can ever call.
 * Anything else throws PlaidPolicyError before any network activity.
 * Every endpoint here is read-only (or, for the two token helpers, only mints
 * read-scoped tokens). Adding to this list requires a security review.
 */
export const ALLOWED_PLAID_ENDPOINTS = [
  "/link/token/create",
  "/item/public_token/exchange",
  "/accounts/balance/get",
  "/transactions/sync",
  "/institutions/search",
  "/institutions/get",
  "/transactions/recurring/get",
] as const;
export type AllowedPlaidEndpoint = (typeof ALLOWED_PLAID_ENDPOINTS)[number];

/** Plaid's API is POST-only for these read calls. Nothing else is permitted. */
export const ALLOWED_HTTP_METHODS = ["POST"] as const;

/** Link may be initialised with exactly this product set. */
export const ALLOWED_LINK_PRODUCTS = ["transactions"] as const;

export class PlaidPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaidPolicyError";
  }
}

export function assertAllowedEndpoint(path: string): asserts path is AllowedPlaidEndpoint {
  if (typeof path !== "string" || !(ALLOWED_PLAID_ENDPOINTS as readonly string[]).includes(path)) {
    throw new PlaidPolicyError(`Plaid endpoint not allowlisted: ${String(path)}`);
  }
}

export function assertAllowedMethod(method: string): void {
  if (!(ALLOWED_HTTP_METHODS as readonly string[]).includes(method)) {
    throw new PlaidPolicyError(`HTTP method not allowed: ${String(method)}`);
  }
}

export function assertReadOnlyProducts(products: readonly string[]): void {
  const ok =
    products.length === ALLOWED_LINK_PRODUCTS.length &&
    products.every((p, i) => p === ALLOWED_LINK_PRODUCTS[i]);
  if (!ok) {
    throw new PlaidPolicyError(`Link products must be exactly [${ALLOWED_LINK_PRODUCTS.join(", ")}]`);
  }
}
