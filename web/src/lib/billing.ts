import type Stripe from "stripe";
import { appUrl } from "../env";
import { proPriceIds } from "./entitlements";
import type { Repo } from "./repo";

/** Tag for comparing checkout flows in the Dashboard (label + 8 random letters, generated once). */
export const CHECKOUT_INTEGRATION_ID = "levelupinvest-pro-subscription-qkzwmtrh";

export class BillingInputError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BillingInputError";
  }
}

async function ensureCustomer(s: Stripe, repo: Repo, user: { id: string; email: string | null }): Promise<string> {
  const existing = await repo.getStripeCustomerId(user.id);
  if (existing) return existing;
  const c = await s.customers.create(
    { email: user.email ?? undefined, metadata: { app_user_id: user.id } },
    { idempotencyKey: `customer-create-${user.id}` },
  );
  await repo.setStripeCustomerId(user.id, c.id);
  return c.id;
}

/**
 * Creates a Stripe Checkout Session in subscription mode. The price must be one
 * of the env-configured Pro prices (no client-supplied arbitrary price IDs).
 * Payment methods are not pinned in code: dynamic payment methods are configured in the Dashboard.
 */
export async function createCheckoutSession(
  s: Stripe,
  repo: Repo,
  user: { id: string; email: string | null },
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  if (!proPriceIds(env).has(priceId)) throw new BillingInputError("Unknown price");
  const current = await repo.getSubscription(user.id);
  if (current && ["active", "trialing", "past_due"].includes(current.status)) {
    throw new BillingInputError("Already subscribed; use the billing portal to change plans");
  }
  const customer = await ensureCustomer(s, repo, user);
  const base = appUrl(env);
  const params = {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { app_user_id: user.id } },
    success_url: `${base}/dashboard?checkout=success`,
    cancel_url: `${base}/pricing?checkout=cancelled`,
    allow_promotion_codes: true,
    integration_identifier: CHECKOUT_INTEGRATION_ID,
  } as Stripe.Checkout.SessionCreateParams;
  const session = await s.checkout.sessions.create(params);
  if (!session.url) throw new Error("Checkout session has no URL");
  return session.url;
}

export async function createPortalSession(
  s: Stripe,
  repo: Repo,
  userId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const customer = await repo.getStripeCustomerId(userId);
  if (!customer) throw new BillingInputError("No billing account yet");
  const portal = await s.billingPortal.sessions.create({ customer, return_url: `${appUrl(env)}/dashboard` });
  return portal.url;
}
