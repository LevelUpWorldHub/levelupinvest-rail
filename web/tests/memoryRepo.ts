import type { PlaidItemRow, Repo, SubscriptionRow } from "../src/lib/repo";

export function memoryRepo(): Repo & { _items: PlaidItemRow[] } {
  const customers = new Map<string, string>();
  const subs = new Map<string, SubscriptionRow>();
  const events = new Set<string>();
  const items: PlaidItemRow[] = [];
  let n = 0;
  return {
    _items: items,
    async getStripeCustomerId(u) { return customers.get(u) ?? null; },
    async setStripeCustomerId(u, c) { customers.set(u, c); },
    async findUserIdByStripeCustomer(c) { for (const [u, x] of customers) if (x === c) return u; return null; },
    async getSubscription(u) { return subs.get(u) ?? null; },
    async upsertSubscription(r) { subs.set(r.userId, { ...r }); },
    async markEventProcessed(id) { if (events.has(id)) return false; events.add(id); return true; },
    async listPlaidItems(u) { return items.filter((i) => i.userId === u); },
    async addPlaidItem(u, it) { const row = { ...it, id: `pi_${++n}`, userId: u, createdAt: new Date() }; items.push(row); return row; },
    async deletePlaidItem(u, id) { const i = items.findIndex((x) => x.userId === u && x.id === id); if (i < 0) return false; items.splice(i, 1); return true; },
  };
}
