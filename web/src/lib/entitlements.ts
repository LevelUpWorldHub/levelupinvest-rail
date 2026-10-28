/**
 * Plans and entitlement gating. Pricing is a PLACEHOLDER: the actual Stripe
 * Price IDs come from env (STRIPE_PRICE_PRO_MONTHLY / _YEARLY) and amounts are
 * set in the Stripe Dashboard, not in code.
 */
export type Plan = "free" | "pro";

export type Feature =
  | "demo_data" // mock-data budgeting, spending, goals, net worth
  | "goal_tools"
  | "link_bank" // Plaid Link (sandbox in Phase 1)
  | "live_insights" // tools over the user's own linked data
  | "recurring_detection";

export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  free: ["demo_data", "goal_tools"],
  pro: ["demo_data", "goal_tools", "link_bank", "live_insights", "recurring_detection"],
};

export const PLAN_LIMITS: Record<Plan, { linkedItems: number }> = {
  free: { linkedItems: 0 },
  pro: { linkedItems: 5 },
};

/** Stripe subscription statuses that grant paid access. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
/** past_due keeps access during Stripe's retry window (Smart Retries); unpaid/canceled do not. */
const GRACE_STATUSES = new Set(["past_due"]);

export interface SubscriptionSnapshot {
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
}

export function proPriceIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    [env.STRIPE_PRICE_PRO_MONTHLY, env.STRIPE_PRICE_PRO_YEARLY].map((s) => s?.trim()).filter((s): s is string => !!s),
  );
}

export function planFor(
  sub: SubscriptionSnapshot | null,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Plan {
  if (!sub || !sub.priceId) return "free";
  if (!proPriceIds(env).has(sub.priceId)) return "free";
  if (ACTIVE_STATUSES.has(sub.status)) return "pro";
  if (GRACE_STATUSES.has(sub.status) && sub.currentPeriodEnd && sub.currentPeriodEnd > now) return "pro";
  return "free";
}

export function can(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export class EntitlementError extends Error {
  readonly feature: Feature;
  constructor(feature: Feature) {
    super(`Upgrade required for ${feature}`);
    this.name = "EntitlementError";
    this.feature = feature;
  }
}

export function assertCan(plan: Plan, feature: Feature): void {
  if (!can(plan, feature)) throw new EntitlementError(feature);
}
