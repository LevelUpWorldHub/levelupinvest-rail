import Stripe from "stripe";
import { requireEnv } from "../env";

export class LiveModeBlockedError extends Error {
  constructor() {
    super("Live Stripe keys are blocked in Phase 1. Use a sk_test_/rk_test_ key (or set STRIPE_ALLOW_LIVE=true after go-live review).");
    this.name = "LiveModeBlockedError";
  }
}

/** Phase 1 guard: only test-mode keys are accepted unless STRIPE_ALLOW_LIVE=true. */
export function assertTestModeKey(key: string, env: Record<string, string | undefined> = process.env): void {
  const isTest = /^(sk|rk)_test_/.test(key);
  if (!isTest && env.STRIPE_ALLOW_LIVE?.trim() !== "true") throw new LiveModeBlockedError();
}

let _client: Stripe | null = null;

/** One StripeClient instance (no global API key). API version is the SDK's pinned latest. */
export function stripe(env: Record<string, string | undefined> = process.env): Stripe {
  if (!_client) {
    const key = requireEnv("STRIPE_SECRET_KEY", env);
    assertTestModeKey(key, env);
    _client = new Stripe(key, { appInfo: { name: "levelupinvest-web", version: "0.1.0" } });
  }
  return _client;
}
