import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLinkToken, exchangeAndStore, providerForUser, sandboxClient, PlaidNotConfiguredError } from "../src/lib/plaid";
import { EntitlementError } from "../src/lib/entitlements";
import { decryptSecret } from "../src/lib/crypto";
import { memoryRepo } from "./memoryRepo";

const env = { PLAID_CLIENT_ID: "cid", PLAID_SECRET: "sec", PLAID_ENV: "sandbox" };
const key = { id: "v1", key: randomBytes(32) };

function fakeFetch(log: Array<{ url: string; body: any }>) {
  let n = 0;
  return async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    log.push({ url, body });
    const path = new URL(url).pathname;
    let data: unknown = {};
    if (path === "/link/token/create") data = { link_token: "link-token-placeholder" };
    if (path === "/item/public_token/exchange") data = { access_token: `tok-${body.public_token}-${++n}`, item_id: `item_${n}` };
    if (path === "/accounts/balance/get") data = { accounts: [{ account_id: `acc-${body.access_token}`, name: "Checking", type: "depository", balances: { current: 100 } }] };
    return { ok: true, status: 200, json: async () => data };
  };
}

describe("Plaid (sandbox) in the SaaS", () => {
  it("refuses production and missing config in Phase 1", () => {
    expect(() => sandboxClient({ ...env, PLAID_ENV: "production" })).toThrow(PlaidNotConfiguredError);
    expect(() => sandboxClient({})).toThrow(PlaidNotConfiguredError);
  });

  it("link token: free is blocked, pro gets a transactions-only token for its own user id", async () => {
    const log: any[] = [];
    const c = sandboxClient(env, fakeFetch(log));
    await expect(createLinkToken(c, "u1", "free")).rejects.toThrow(EntitlementError);
    expect(log).toHaveLength(0);
    expect(await createLinkToken(c, "u1", "pro")).toBe("link-token-placeholder");
    expect(log[0].url).toBe("https://sandbox.plaid.com/link/token/create");
    expect(log[0].body.products).toEqual(["transactions"]);
    expect(log[0].body.user.client_user_id).toBe("u1");
  });

  it("exchange stores ONLY ciphertext and never returns the access token", async () => {
    const repo = memoryRepo(); const log: any[] = [];
    const out = await exchangeAndStore(sandboxClient(env, fakeFetch(log)), repo, key, "u1", "pro", "public-abc-123456", "Test Bank");
    expect(JSON.stringify(out)).not.toContain("tok-");
    const row = repo._items[0]!;
    expect(row.accessTokenEnc).not.toContain("tok-");
    expect(decryptSecret(row.accessTokenEnc, "u1", [key])).toMatch(/^tok-public-abc-123456/);
  });

  it("enforces plan item limits", async () => {
    const repo = memoryRepo(); const c = sandboxClient(env, fakeFetch([]));
    await expect(exchangeAndStore(c, repo, key, "u1", "free", "public-x-0000000", null)).rejects.toThrow(EntitlementError);
    for (let i = 0; i < 5; i++) await exchangeAndStore(c, repo, key, "u1", "pro", `public-x-${i}000000`, null);
    await expect(exchangeAndStore(c, repo, key, "u1", "pro", "public-x-6000000", null)).rejects.toThrow(EntitlementError);
  });

  it("per-user isolation: each user's provider only sees their own items", async () => {
    const repo = memoryRepo(); const c = sandboxClient(env, fakeFetch([]));
    await exchangeAndStore(c, repo, key, "alice", "pro", "public-alice-0001", null);
    await exchangeAndStore(c, repo, key, "bob", "pro", "public-bob-000001", null);
    const log: any[] = [];
    const { provider, source } = await providerForUser(repo, [key], "bob", "pro", env, fakeFetch(log));
    expect(source).toBe("plaid-sandbox");
    const accts = await provider.getBalances();
    expect(log.every((l) => String(l.body.access_token).includes("public-bob"))).toBe(true);
    expect(JSON.stringify(accts)).not.toContain("alice");
    expect(await repo.deletePlaidItem("bob", repo._items[0]!.id)).toBe(false); // alice's item
  });

  it("tampered cross-user ciphertext cannot be used", async () => {
    const repo = memoryRepo(); const c = sandboxClient(env, fakeFetch([]));
    await exchangeAndStore(c, repo, key, "alice", "pro", "public-alice-0001", null);
    repo._items[0]!.userId = "mallory"; // simulate a row re-pointed to another user
    await expect(providerForUser(repo, [key], "mallory", "pro", env)).rejects.toThrow();
  });

  it("free plan or no items => mock data", async () => {
    const repo = memoryRepo();
    expect((await providerForUser(repo, [key], "u1", "free", env)).source).toBe("mock");
    expect((await providerForUser(repo, [key], "u1", "pro", env)).source).toBe("mock");
  });
});
