import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_LINK_PRODUCTS,
  PlaidClient,
  PlaidPolicyError,
  PlaidProvider,
  assertReadOnlyProducts,
  buildLinkTokenRequest,
  type FetchLike,
} from "../src/index.js";

const FORBIDDEN_PRODUCTS = ["auth", "transfer", "payment_initiation", "identity", "investments", "liabilities", "income_verification", "signal", "assets"];

describe("HARD LINES (f): Link token request", () => {
  it("builder emits products == ['transactions'] only", () => {
    const req = buildLinkTokenRequest("user-123");
    expect(req.products).toEqual(["transactions"]);
    expect([...ALLOWED_LINK_PRODUCTS]).toEqual(["transactions"]);
    for (const p of FORBIDDEN_PRODUCTS) expect(req.products as string[]).not.toContain(p);
    expect(JSON.stringify(req)).not.toMatch(/transfer|payment|"auth"/i);
  });

  it("the request actually sent over the (fake) wire has products == ['transactions']", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ link_token: "link-test-token", expiration: "2026-10-05T00:00:00Z" }) });
    const p = new PlaidProvider(
      { clientId: "test-client-id", secret: "test-secret-value", env: "sandbox", accessTokens: [] },
      { fetchImpl: spy as unknown as FetchLike },
    );
    const out = await p.requestLinkToken("user-123");
    expect(out.linkToken).toBe("link-test-token");
    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://sandbox.plaid.com/link/token/create");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.products).toEqual(["transactions"]);
    expect(body.country_codes).toEqual(["US"]);
    expect(Object.keys(body).sort()).toEqual(["client_id", "client_name", "country_codes", "language", "products", "secret", "user"]);
    expect(body).not.toHaveProperty("required_if_supported_products");
    expect(body).not.toHaveProperty("optional_products");
    expect(body).not.toHaveProperty("additional_consented_products");
    expect(body).not.toHaveProperty("payment_initiation");
    expect(body).not.toHaveProperty("transfer");
  });

  for (const bad of [["auth"], ["transactions", "auth"], ["transfer"], ["payment_initiation"], [], ["transactions", "transactions"], ["Transactions"]]) {
    it(`assertReadOnlyProducts rejects ${JSON.stringify(bad)}`, () => {
      expect(() => assertReadOnlyProducts(bad)).toThrow(PlaidPolicyError);
    });

    it(`client refuses to send a link token request with products ${JSON.stringify(bad)}`, async () => {
      const spy = vi.fn();
      const c = new PlaidClient({ clientId: "test-client-id", secret: "test-secret-value", env: "sandbox", fetchImpl: spy as unknown as FetchLike });
      await expect(c.callReadEndpoint("/link/token/create", { products: bad })).rejects.toBeInstanceOf(PlaidPolicyError);
      expect(spy).not.toHaveBeenCalled();
    });
  }

  it("a link token request with no products is rejected too", async () => {
    const spy = vi.fn();
    const c = new PlaidClient({ clientId: "test-client-id", secret: "test-secret-value", env: "sandbox", fetchImpl: spy as unknown as FetchLike });
    await expect(c.callReadEndpoint("/link/token/create", {})).rejects.toBeInstanceOf(PlaidPolicyError);
    expect(spy).not.toHaveBeenCalled();
  });
});
