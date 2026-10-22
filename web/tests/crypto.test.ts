import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, loadKey } from "../src/lib/crypto";

const k1 = { id: "v1", key: randomBytes(32) };
const k2 = { id: "v2", key: randomBytes(32) };
const token = "plaid-access-token-placeholder-value";

describe("token encryption (AES-256-GCM, user-bound AAD)", () => {
  it("round-trips and never contains plaintext", () => {
    const e = encryptSecret(token, "user_a", k1);
    expect(e).not.toContain(token);
    expect(e.startsWith("v1:")).toBe(true);
    expect(decryptSecret(e, "user_a", [k1])).toBe(token);
  });
  it("uses a fresh IV each time", () => expect(encryptSecret(token, "u", k1)).not.toBe(encryptSecret(token, "u", k1)));
  it("fails for a different user (row copied across users)", () => {
    expect(() => decryptSecret(encryptSecret(token, "user_a", k1), "user_b", [k1])).toThrow();
  });
  it("fails on tamper", () => {
    const [id, iv, tag, ct] = encryptSecret(token, "u", k1).split(":");
    const bad = Buffer.from(ct!, "base64"); bad[0]! ^= 1;
    expect(() => decryptSecret([id, iv, tag, bad.toString("base64")].join(":"), "u", [k1])).toThrow();
  });
  it("supports key rotation by key id", () => {
    const old = encryptSecret(token, "u", k1);
    expect(decryptSecret(old, "u", [k2, k1])).toBe(token);
    expect(() => decryptSecret(old, "u", [k2])).toThrow(/key id v1/);
  });
  it("loadKey validates length and comes only from env", () => {
    expect(() => loadKey({})).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => loadKey({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 bytes/);
    expect(loadKey({ TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"), TOKEN_ENCRYPTION_KEY_ID: "v7" }).id).toBe("v7");
  });
});
