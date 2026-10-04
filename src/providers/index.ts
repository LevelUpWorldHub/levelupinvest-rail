import { parsePlaidConfig } from "../plaid/client.js";
import { MockProvider } from "./mock.js";
import { PlaidProvider } from "./plaid.js";
import type { AggregationProvider } from "./types.js";

export interface ProviderSelection {
  provider: AggregationProvider;
  reason: string;
}

/**
 * Default is Mock. Plaid is enabled ONLY when PLAID_CLIENT_ID and PLAID_SECRET
 * exist and PLAID_ENV is sandbox|production.
 */
export function createProvider(env: Record<string, string | undefined> = process.env): ProviderSelection {
  const cfg = parsePlaidConfig(env);
  if (!cfg) {
    return {
      provider: new MockProvider(),
      reason: "mock (PLAID_CLIENT_ID/PLAID_SECRET/PLAID_ENV=sandbox|production not all set)",
    };
  }
  return { provider: new PlaidProvider(cfg), reason: `plaid (${cfg.env})` };
}
