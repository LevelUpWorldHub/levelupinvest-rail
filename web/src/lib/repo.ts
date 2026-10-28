import type { SubscriptionSnapshot } from "./entitlements";

/**
 * Data-access contract. EVERY user-scoped method takes userId as its first
 * argument and implementations MUST filter by it, so one user can never read
 * or modify another user's rows. Tests run the same contract against an
 * in-memory implementation; production uses the Drizzle/Postgres one.
 */
export interface SubscriptionRow extends SubscriptionSnapshot {
  stripeSubscriptionId: string;
  userId: string;
  cancelAtPeriodEnd: boolean;
}

export interface PlaidItemRow {
  id: string;
  userId: string;
  itemId: string;
  institutionName: string | null;
  accessTokenEnc: string;
  createdAt: Date;
}

export interface Repo {
  // users <-> stripe customers
  getStripeCustomerId(userId: string): Promise<string | null>;
  setStripeCustomerId(userId: string, customerId: string): Promise<void>;
  findUserIdByStripeCustomer(customerId: string): Promise<string | null>;

  // subscriptions (one current row per user)
  getSubscription(userId: string): Promise<SubscriptionRow | null>;
  upsertSubscription(row: SubscriptionRow): Promise<void>;

  // webhook idempotency: returns false if already processed
  markEventProcessed(eventId: string): Promise<boolean>;

  // plaid items (user-scoped)
  listPlaidItems(userId: string): Promise<PlaidItemRow[]>;
  addPlaidItem(userId: string, item: Omit<PlaidItemRow, "id" | "userId" | "createdAt">): Promise<PlaidItemRow>;
  deletePlaidItem(userId: string, id: string): Promise<boolean>;
}
