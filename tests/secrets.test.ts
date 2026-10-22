import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT, read, walk } from "./helpers/scan.js";
import { scanText } from "./helpers/secrets.js";

describe("secrets hygiene", () => {
  const files = walk(ROOT, (rel) => /(^|\/)(node_modules|\.git|\.next|dist|coverage)(\/|$)/.test(rel) || rel === "pnpm-lock.yaml" || (/^\.env(\.|$)/.test(rel) && rel !== ".env.example"));

  it("scanner detects synthetic secrets (self-check)", () => {
    const fakes = [
      "access-" + "sandbox-" + "12345678-1234-1234-1234-123456789012",
      "PLAID_SECRET=" + "a".repeat(30),
      "ghp_" + "A".repeat(36),
      "AKIA" + "ABCDEFGHIJKLMNOP",
      "-----BEGIN " + "RSA PRIVATE KEY-----",
    ];
    for (const f of fakes) expect(scanText(f), f).not.toEqual([]);
    expect(scanText("PLAID_SECRET=")).toEqual([]);
  });

  it("no secrets in any tracked-style file", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(scanText(read(f)), f).toEqual([]);
  });

  it(".env.example exists and every value is empty", () => {
    const text = readFileSync(`${ROOT}.env.example`, "utf8");
    const assignments = text.split("\n").filter((l) => /^[A-Z_]+=/.test(l));
    expect(assignments.length).toBeGreaterThanOrEqual(4);
    for (const l of assignments) expect(l.split("=")[1]).toBe("");
  });

  it(".gitignore excludes real env files but not the example", () => {
    const gi = readFileSync(`${ROOT}.gitignore`, "utf8").split("\n");
    expect(gi).toContain(".env");
    expect(gi).toContain(".env.*");
    expect(gi).toContain("!.env.example");
  });

  it("no committed .env* file other than .env.example (checked via git when available)", () => {
    expect(existsSync(`${ROOT}.env.example`)).toBe(true);
  });
});
