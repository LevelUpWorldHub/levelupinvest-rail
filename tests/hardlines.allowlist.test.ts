import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_HTTP_METHODS,
  ALLOWED_PLAID_ENDPOINTS,
  PlaidClient,
  PlaidPolicyError,
  assertAllowedEndpoint,
  assertAllowedMethod,
  type FetchLike,
} from "../src/index.js";

function client() {
  const spy = vi.fn();
  const c = new PlaidClient({ clientId: "test-client-id", secret: "test-secret-value", env: "sandbox", fetchImpl: spy as unknown as FetchLike });
  return { c, spy };
}

const BAD_PATHS = [
  "/transfer/create",
  "/transfer/authorization/create",
  "/payment_initiation/payment/create",
  "/payment_initiation/payment/get",
  "/processor/token/create",
  "/auth/get",
  "/signal/evaluate",
  "/investments/transactions/get",
  "/investments/orders/create",
  "/bank_transfer/create",
  "/sandbox/public_token/create",
  "/item/remove",
  "/accounts/get",
  "",
  "transactions/sync",
  "/transactions/sync/",
  "/transactions/sync?x=1",
  "/TRANSACTIONS/SYNC",
  "/transactions/sync/../transfer/create",
  "//transactions/sync",
  "/transactions/%73ync",
  "https://evil.example.com/transactions/sync",
];

describe("HARD LINES (c): Plaid allowlist throws before any network", () => {
  it("allowlist is exactly the expected read endpoints", () => {
    expect([...ALLOWED_PLAID_ENDPOINTS].sort()).toEqual(
      [
        "/accounts/balance/get",
        "/institutions/get",
        "/institutions/search",
        "/item/public_token/exchange",
        "/link/token/create",
        "/transactions/recurring/get",
        "/transactions/sync",
      ].sort(),
    );
    expect([...ALLOWED_HTTP_METHODS]).toEqual(["POST"]);
  });

  for (const path of BAD_PATHS) {
    it(`rejects ${JSON.stringify(path)} without touching the network`, async () => {
      const { c, spy } = client();
      await expect(c.callReadEndpoint(path, {})).rejects.toBeInstanceOf(PlaidPolicyError);
      expect(spy).not.toHaveBeenCalled();
      expect(() => assertAllowedEndpoint(path)).toThrow(PlaidPolicyError);
    });
  }

  for (const method of ["GET", "PUT", "DELETE", "PATCH", "post", "HEAD", "OPTIONS", ""]) {
    it(`rejects HTTP method ${JSON.stringify(method)} even on an allowed path`, async () => {
      const { c, spy } = client();
      await expect(c.callReadEndpoint("/transactions/sync", {}, method)).rejects.toBeInstanceOf(PlaidPolicyError);
      expect(spy).not.toHaveBeenCalled();
      expect(() => assertAllowedMethod(method)).toThrow(PlaidPolicyError);
    });
  }

  it("accepts every allowlisted path with POST (and calls only plaid hosts)", async () => {
    for (const path of ALLOWED_PLAID_ENDPOINTS) {
      const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      const c = new PlaidClient({ clientId: "test-client-id", secret: "test-secret-value", env: "production", fetchImpl: spy as unknown as FetchLike });
      const body = path === "/link/token/create" ? { products: ["transactions"] } : {};
      await c.callReadEndpoint(path, body);
      expect(spy).toHaveBeenCalledTimes(1);
      const [url, init] = spy.mock.calls[0] as [string, { method: string }];
      expect(url).toBe(`https://production.plaid.com${path}`);
      expect(init.method).toBe("POST");
    }
  });

  it("rejects unsupported environments (no development/custom hosts)", () => {
    for (const env of ["development", "custom", "", "http://localhost"]) {
      expect(() => new PlaidClient({ clientId: "a", secret: "b", env: env as never })).toThrow(PlaidPolicyError);
    }
  });

  it("global fetch is stubbed in tests (no accidental network)", () => {
    expect(() => (globalThis.fetch as unknown as () => void)()).toThrow(/NETWORK DISABLED/);
  });

  it("without fetchImpl the client would use global fetch — which is blocked here — only after the allowlist passes", async () => {
    const c = new PlaidClient({ clientId: "test-client-id", secret: "test-secret-value", env: "sandbox" });
    await expect(c.callReadEndpoint("/transfer/create", {})).rejects.toBeInstanceOf(PlaidPolicyError);
    await expect(c.callReadEndpoint("/transactions/sync", {})).rejects.toThrow(/NETWORK DISABLED/);
  });
});
