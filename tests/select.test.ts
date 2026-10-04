import { describe, expect, it } from "vitest";
import { MockProvider, PlaidProvider, createProvider, parsePlaidConfig } from "../src/index.js";

const full = { PLAID_CLIENT_ID: "test-client-id", PLAID_SECRET: "test-secret-value", PLAID_ENV: "sandbox" };

describe("provider selection (Mock by default)", () => {
  it("defaults to mock with empty env", () => {
    const s = createProvider({});
    expect(s.provider).toBeInstanceOf(MockProvider);
    expect(s.provider.name).toBe("mock");
  });

  for (const [label, env] of [
    ["missing client id", { ...full, PLAID_CLIENT_ID: undefined }],
    ["missing secret", { ...full, PLAID_SECRET: undefined }],
    ["missing env", { ...full, PLAID_ENV: undefined }],
    ["blank values", { PLAID_CLIENT_ID: " ", PLAID_SECRET: "", PLAID_ENV: "sandbox" }],
    ["env=development", { ...full, PLAID_ENV: "development" }],
    ["env=Sandbox (case)", { ...full, PLAID_ENV: "Sandbox" }],
    ["env=bogus", { ...full, PLAID_ENV: "bogus" }],
  ] as const) {
    it(`falls back to mock: ${label}`, () => {
      expect(createProvider(env).provider).toBeInstanceOf(MockProvider);
      expect(parsePlaidConfig(env)).toBeNull();
    });
  }

  for (const e of ["sandbox", "production"]) {
    it(`enables plaid for PLAID_ENV=${e}`, () => {
      const s = createProvider({ ...full, PLAID_ENV: e });
      expect(s.provider).toBeInstanceOf(PlaidProvider);
      expect(s.provider.name).toBe("plaid");
    });
  }

  it("parses access tokens and never leaks secrets via JSON/reason", () => {
    const s = createProvider({ ...full, PLAID_ACCESS_TOKENS: "tok-a, tok-b ,," });
    expect(parsePlaidConfig({ ...full, PLAID_ACCESS_TOKENS: "tok-a, tok-b ,," })!.accessTokens).toEqual(["tok-a", "tok-b"]);
    const dump = JSON.stringify(s.provider) + s.reason;
    expect(dump).not.toContain("test-secret-value");
    expect(dump).not.toContain("test-client-id");
    expect(dump).not.toContain("tok-a");
  });

  it("does not read process.env implicitly when an env object is passed", () => {
    const before = process.env.PLAID_CLIENT_ID;
    process.env.PLAID_CLIENT_ID = "x";
    try {
      expect(createProvider({}).provider.name).toBe("mock");
    } finally {
      if (before === undefined) delete process.env.PLAID_CLIENT_ID;
      else process.env.PLAID_CLIENT_ID = before;
    }
  });
});
