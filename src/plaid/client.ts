import {
  assertAllowedEndpoint,
  assertAllowedMethod,
  ALLOWED_LINK_PRODUCTS,
  assertReadOnlyProducts,
  PlaidPolicyError,
} from "./allowlist.js";

export type PlaidEnv = "sandbox" | "production";

const BASE_URLS: Record<PlaidEnv, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnv;
  accessTokens: string[];
}

/** Returns config only when PLAID_CLIENT_ID, PLAID_SECRET exist and PLAID_ENV is sandbox|production. */
export function parsePlaidConfig(env: Record<string, string | undefined>): PlaidConfig | null {
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  const plaidEnv = env.PLAID_ENV?.trim();
  if (!clientId || !secret) return null;
  if (plaidEnv !== "sandbox" && plaidEnv !== "production") return null;
  const accessTokens = (env.PLAID_ACCESS_TOKENS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { clientId, secret, env: plaidEnv, accessTokens };
}

export class PlaidApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PlaidApiError";
    this.status = status;
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface LinkTokenRequest {
  client_name: string;
  language: "en";
  country_codes: ["US"];
  user: { client_user_id: string };
  products: ["transactions"];
}

/** Link token request: products is exactly ['transactions']. Any other product is rejected. */
export function buildLinkTokenRequest(clientUserId: string, clientName = "LevelUpInvest"): LinkTokenRequest {
  const products = [...ALLOWED_LINK_PRODUCTS] as ["transactions"];
  assertReadOnlyProducts(products);
  return {
    client_name: clientName,
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: clientUserId },
    products,
  };
}

/** Thin HTTP layer. Rejects non-allowlisted paths and non-allowed methods BEFORE touching the network. */
export class PlaidClient {
  readonly env: PlaidEnv;
  readonly #clientId: string;
  readonly #secret: string;
  readonly #fetch: FetchLike | undefined;

  constructor(opts: { clientId: string; secret: string; env: PlaidEnv; fetchImpl?: FetchLike }) {
    if (opts.env !== "sandbox" && opts.env !== "production") {
      throw new PlaidPolicyError(`Unsupported PLAID_ENV: ${String(opts.env)}`);
    }
    this.env = opts.env;
    this.#clientId = opts.clientId;
    this.#secret = opts.secret;
    this.#fetch = opts.fetchImpl;
  }

  toJSON(): { env: PlaidEnv } {
    return { env: this.env };
  }

  async callReadEndpoint<T>(path: string, body: Record<string, unknown> = {}, method = "POST"): Promise<T> {
    assertAllowedMethod(method);
    assertAllowedEndpoint(path);
    if (path === "/link/token/create") {
      assertReadOnlyProducts((body.products as string[] | undefined) ?? []);
    }
    const doFetch = this.#fetch ?? (globalThis.fetch as unknown as FetchLike);
    const res = await doFetch(BASE_URLS[this.env] + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.#clientId, secret: this.#secret, ...body }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const type = String(data.error_type ?? "UNKNOWN");
      const code = String(data.error_code ?? "UNKNOWN");
      const msg = String(data.error_message ?? "request failed");
      throw new PlaidApiError(`Plaid ${path} failed: ${type}/${code}: ${msg}`, res.status);
    }
    return data as T;
  }
}
