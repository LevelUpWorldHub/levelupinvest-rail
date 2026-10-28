import { and, eq } from "drizzle-orm";
import type { PlaidItemRow, Repo, SubscriptionRow } from "../lib/repo";
import { db } from "./index";
import { plaidItems, stripeEvents, subscriptions, users } from "./schema";

/** Postgres implementation of Repo. Every user-scoped query filters by userId. */
export const drizzleRepo: Repo = {
  async getStripeCustomerId(userId) {
    const r = await db().select({ c: users.stripeCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
    return r[0]?.c ?? null;
  },
  async setStripeCustomerId(userId, customerId) {
    await db().update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
  },
  async findUserIdByStripeCustomer(customerId) {
    const r = await db().select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
    return r[0]?.id ?? null;
  },
  async getSubscription(userId) {
    const r = await db().select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    const s = r[0];
    if (!s) return null;
    return {
      userId: s.userId,
      stripeSubscriptionId: s.stripeSubscriptionId,
      status: s.status,
      priceId: s.priceId,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    } satisfies SubscriptionRow;
  },
  async upsertSubscription(row) {
    const values = { ...row, updatedAt: new Date() };
    await db()
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: subscriptions.userId, set: values });
  },
  async markEventProcessed(eventId) {
    const r = await db().insert(stripeEvents).values({ id: eventId }).onConflictDoNothing().returning({ id: stripeEvents.id });
    return r.length > 0;
  },
  async listPlaidItems(userId) {
    return (await db().select().from(plaidItems).where(eq(plaidItems.userId, userId))) as PlaidItemRow[];
  },
  async addPlaidItem(userId, item) {
    const r = await db()
      .insert(plaidItems)
      .values({ ...item, userId })
      .onConflictDoUpdate({ target: [plaidItems.userId, plaidItems.itemId], set: { accessTokenEnc: item.accessTokenEnc, institutionName: item.institutionName } })
      .returning();
    return r[0] as PlaidItemRow;
  },
  async deletePlaidItem(userId, id) {
    const r = await db().delete(plaidItems).where(and(eq(plaidItems.userId, userId), eq(plaidItems.id, id))).returning({ id: plaidItems.id });
    return r.length > 0;
  },
};
