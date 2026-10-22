import { PlaidClient, buildLinkTokenRequest, parsePlaidConfig, type FetchLike } from "@rail/plaid/client";
import { PlaidProvider } from "@rail/providers/plaid";
import { MockProvider } from "@rail/providers/mock";
import type { AggregationProvider } from "@rail/providers/types";
import { decryptSecret, encryptSecret, type EncryptionKey } from "./crypto";
import { assertCan, PLAN_LIMITS, type Plan, EntitlementError } from "./entitlements";
import type { Repo } from "./repo";

/**
 * Plaid for the SaaS. Reuses the rail's allowlisted PlaidClient, so only the
 * read-only endpoints and the ['transactions'] product are ever possible.
 * Phase 1: PLAID_ENV must be "sandbox"; production is refused here.
 */
export class PlaidNotConfiguredError extends Error {
  constructor(msg = "Plaid is not configured (PLAID_CLIENT_ID/PLAID_SECRET/PLAID_ENV=sandbox)") {
    super(msg);
    this.name = "PlaidNotConfiguredError";
  }
}

export function sandboxClient(env: Record<string, string | undefined> = process.env, fetchImpl?: FetchLike): PlaidClient {
  const cfg = parsePlaidConfig(env);
  if (!cfg) throw new PlaidNotConfiguredError();
  if (cfg.env !== "sandbox") throw new PlaidNotConfiguredError("Phase 1 allows PLAID_ENV=sandbox only");
  return new PlaidClient({ clientId: cfg.clientId, secret: cfg.secret, env: "sandbox", ...(fetchImpl ? { fetchImpl } : {}) });
}

export async function createLinkToken(client: PlaidClient, userId: string, plan: Plan): Promise<string> {
  assertCan(plan, "link_bank");
  const r = await client.callReadEndpoint<{ link_token: string }>("/link/token/create", { ...buildLinkTokenRequest(userId) });
  return r.link_token;
}

export async function exchangeAndStore(
  client: PlaidClient,
  repo: Repo,
  key: EncryptionKey,
  userId: string,
  plan: Plan,
  publicToken: string,
  institutionName: string | null,
): Promise<{ id: string; institutionName: string | null }> {
  assertCan(plan, "link_bank");
  const existing = await repo.listPlaidItems(userId);
  if (existing.length >= PLAN_LIMITS[plan].linkedItems) throw new EntitlementError("link_bank");
  const r = await client.callReadEndpoint<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken,
  });
  const row = await repo.addPlaidItem(userId, {
    itemId: r.item_id,
    institutionName,
    accessTokenEnc: encryptSecret(r.access_token, userId, key),
  });
  // Never return the access token to the caller.
  return { id: row.id, institutionName: row.institutionName };
}

/** Provider over ONLY this user's items. Free plan or no items => mock data. */
export async function providerForUser(
  repo: Repo,
  keys: EncryptionKey[],
  userId: string,
  plan: Plan,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): Promise<{ provider: AggregationProvider; source: "mock" | "plaid-sandbox" }> {
  const cfg = parsePlaidConfig(env);
  if (plan !== "pro" || !cfg || cfg.env !== "sandbox") return { provider: new MockProvider(), source: "mock" };
  const items = await repo.listPlaidItems(userId);
  if (items.length === 0) return { provider: new MockProvider(), source: "mock" };
  const accessTokens = items.map((i) => decryptSecret(i.accessTokenEnc, userId, keys));
  return {
    provider: new PlaidProvider({ ...cfg, accessTokens }, fetchImpl ? { fetchImpl } : {}),
    source: "plaid-sandbox",
  };
}
