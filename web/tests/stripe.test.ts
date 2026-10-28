import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { createCheckoutSession, createPortalSession, CHECKOUT_INTEGRATION_ID, BillingInputError } from "../src/lib/billing";
import { assertTestModeKey, LiveModeBlockedError } from "../src/lib/stripe";
import { handleEvent, verifyEvent } from "../src/lib/webhook";
import { planFor } from "../src/lib/entitlements";
import { memoryRepo } from "./memoryRepo";

const env = { STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y", APP_URL: "https://app.example" };
const WHSEC = "whsec_" + "unit_test_only";
const real = new Stripe("sk_" + "test_placeholder"); // never hits network in these tests

function fakeStripe(sub?: Partial<Stripe.Subscription>) {
  return {
    customers: { create: vi.fn(async () => ({ id: "cus_1" })) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.test/s" })) } },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.test/p" })) } },
    subscriptions: {
      retrieve: vi.fn(async (id: string) => ({
        id, customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: {},
        items: { data: [{ price: { id: "price_m" }, current_period_end: 1_900_000_000 }] }, ...sub,
      })),
    },
    webhooks: real.webhooks,
  } as any;
}

function signed(payload: object) {
  const body = JSON.stringify(payload);
  return { body, sig: real.webhooks.generateTestHeaderString({ payload: body, secret: WHSEC }) };
}

describe("Phase 1 live-mode guard", () => {
  it("accepts test keys and rejects live keys", () => {
    expect(() => assertTestModeKey("sk_" + "test_x", {})).not.toThrow();
    expect(() => assertTestModeKey("rk_" + "test_x", {})).not.toThrow();
    expect(() => assertTestModeKey("sk_" + "live_x", {})).toThrow(LiveModeBlockedError);
    expect(() => assertTestModeKey("rk_" + "live_x", {})).toThrow(LiveModeBlockedError);
  });
});

describe("checkout + portal", () => {
  it("creates a subscription-mode session for an env price, reusing one customer", async () => {
    const s = fakeStripe(); const repo = memoryRepo();
    const url = await createCheckoutSession(s, repo, { id: "u1", email: "a@x.test" }, "price_m", env);
    expect(url).toContain("checkout");
    const p = s.checkout.sessions.create.mock.calls[0][0];
    expect(p).toMatchObject({ mode: "subscription", customer: "cus_1", client_reference_id: "u1", line_items: [{ price: "price_m", quantity: 1 }], integration_identifier: CHECKOUT_INTEGRATION_ID });
    expect(p).not.toHaveProperty("payment_method_types");
    expect(p.success_url).toBe("https://app.example/dashboard?checkout=success");
    await createCheckoutSession(s, repo, { id: "u1", email: null }, "price_y", env);
    expect(s.customers.create).toHaveBeenCalledTimes(1);
  });
  it("rejects arbitrary price ids and double subscriptions", async () => {
    const s = fakeStripe(); const repo = memoryRepo();
    await expect(createCheckoutSession(s, repo, { id: "u1", email: null }, "price_evil", env)).rejects.toThrow(BillingInputError);
    await repo.upsertSubscription({ userId: "u1", stripeSubscriptionId: "sub_1", status: "active", priceId: "price_m", currentPeriodEnd: null, cancelAtPeriodEnd: false });
    await expect(createCheckoutSession(s, repo, { id: "u1", email: null }, "price_m", env)).rejects.toThrow(/Already subscribed/);
  });
  it("portal requires an existing customer and uses only the caller's customer", async () => {
    const s = fakeStripe(); const repo = memoryRepo();
    await expect(createPortalSession(s, repo, "u1", env)).rejects.toThrow(BillingInputError);
    await repo.setStripeCustomerId("u1", "cus_1");
    await repo.setStripeCustomerId("u2", "cus_2");
    await createPortalSession(s, repo, "u2", env);
    expect(s.billingPortal.sessions.create.mock.calls[0][0]).toEqual({ customer: "cus_2", return_url: "https://app.example/dashboard" });
  });
});

describe("webhook", () => {
  const evt = (type: string, object: object, id = "evt_" + Math.random().toString(36).slice(2)) => ({ id, object: "event", type, data: { object } });

  it("verifies signatures and rejects tampered/missing/unsigned bodies", () => {
    const { body, sig } = signed(evt("customer.subscription.updated", { id: "sub_1" }));
    expect(verifyEvent(real, body, sig, WHSEC).type).toBe("customer.subscription.updated");
    expect(() => verifyEvent(real, body.replace("sub_1", "sub_2"), sig, WHSEC)).toThrow();
    expect(() => verifyEvent(real, body, null, WHSEC)).toThrow(/Missing/);
    expect(() => verifyEvent(real, body, sig, "whsec_" + "wrong")).toThrow();
  });

  it("checkout.session.completed (paid) grants pro via synced subscription", async () => {
    const s = fakeStripe(); const repo = memoryRepo();
    await repo.setStripeCustomerId("u1", "cus_1");
    const r = await handleEvent(s, repo, evt("checkout.session.completed", { mode: "subscription", payment_status: "paid", subscription: "sub_1", client_reference_id: "u1" }) as any);
    expect(r).toBe("synced:active");
    expect(planFor(await repo.getSubscription("u1"), env)).toBe("pro");
  });

  it("unpaid async checkout does not grant access", async () => {
    const s = fakeStripe(); const repo = memoryRepo();
    expect(await handleEvent(s, repo, evt("checkout.session.completed", { mode: "subscription", payment_status: "unpaid", subscription: "sub_1" }) as any)).toBe("pending");
    expect(await repo.getSubscription("u1")).toBeNull();
  });

  it("subscription deleted revokes pro; duplicates are ignored", async () => {
    const repo = memoryRepo(); await repo.setStripeCustomerId("u1", "cus_1");
    await handleEvent(fakeStripe(), repo, evt("customer.subscription.created", { id: "sub_1" }) as any);
    expect(planFor(await repo.getSubscription("u1"), env)).toBe("pro");
    const del = evt("customer.subscription.deleted", { id: "sub_1" }, "evt_del");
    expect(await handleEvent(fakeStripe({ status: "canceled" }), repo, del as any)).toBe("synced:canceled");
    expect(await handleEvent(fakeStripe({ status: "active" }), repo, del as any)).toBe("duplicate");
    expect(planFor(await repo.getSubscription("u1"), env)).toBe("free");
  });

  it("invoice.payment_failed resyncs status (past_due)", async () => {
    const repo = memoryRepo(); await repo.setStripeCustomerId("u1", "cus_1");
    const r = await handleEvent(fakeStripe({ status: "past_due" }), repo, evt("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }) as any);
    expect(r).toBe("synced:past_due");
  });

  it("ignores unknown event types and unknown customers", async () => {
    const repo = memoryRepo();
    expect(await handleEvent(fakeStripe(), repo, evt("charge.refunded", {}) as any)).toBe("ignored:type");
    expect(await handleEvent(fakeStripe({ customer: "cus_unknown" }), repo, evt("customer.subscription.updated", { id: "sub_9" }) as any)).toBe("ignored:no_user");
  });
});
