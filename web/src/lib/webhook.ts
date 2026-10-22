import type Stripe from "stripe";
import type { Repo, SubscriptionRow } from "./repo";

/**
 * Stripe webhook processing. Signature verification happens in verifyEvent()
 * BEFORE any parsing is trusted; the route passes the RAW request body.
 * Entitlements are derived only from webhook-synced subscription state, never
 * from the checkout success redirect.
 */
export function verifyEvent(s: Stripe, rawBody: string, signature: string | null, secret: string): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return s.webhooks.constructEvent(rawBody, signature, secret);
}

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

function toRow(sub: Stripe.Subscription, userId: string): SubscriptionRow {
  const item = sub.items.data[0];
  const end = (item as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return {
    userId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === "string" ? x : x.id;
}

async function resolveUser(repo: Repo, customerId: string | null, metaUserId?: string | null): Promise<string | null> {
  if (customerId) {
    const u = await repo.findUserIdByStripeCustomer(customerId);
    if (u) return u;
  }
  return metaUserId ?? null;
}

/** Re-fetches the subscription from Stripe so out-of-order events converge on current state. */
async function syncSubscription(s: Stripe, repo: Repo, subscriptionId: string, hintUserId?: string | null): Promise<string> {
  const sub = await s.subscriptions.retrieve(subscriptionId);
  const userId = await resolveUser(repo, idOf(sub.customer), hintUserId ?? sub.metadata?.app_user_id ?? null);
  if (!userId) return "ignored:no_user";
  await repo.upsertSubscription(toRow(sub, userId));
  return `synced:${sub.status}`;
}

export async function handleEvent(s: Stripe, repo: Repo, event: Stripe.Event): Promise<string> {
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) return "ignored:type";
  if (!(await repo.markEventProcessed(event.id))) return "duplicate";

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const cs = event.data.object as Stripe.Checkout.Session;
      if (cs.mode !== "subscription") return "ignored:mode";
      if (cs.payment_status !== "paid" && cs.payment_status !== "no_payment_required") return "pending";
      const subId = idOf(cs.subscription as string | { id: string } | null);
      if (!subId) return "ignored:no_subscription";
      return syncSubscription(s, repo, subId, cs.client_reference_id);
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as unknown as {
        parent?: { subscription_details?: { subscription?: string | { id: string } } };
        subscription?: string | { id: string };
      };
      const subId = idOf(inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null);
      if (!subId) return "ignored:no_subscription";
      return syncSubscription(s, repo, subId);
    }
    default: {
      const sub = event.data.object as Stripe.Subscription;
      return syncSubscription(s, repo, sub.id);
    }
  }
}
