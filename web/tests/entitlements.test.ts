import { describe, expect, it } from "vitest";
import { assertCan, can, EntitlementError, planFor } from "../src/lib/entitlements";

const env = { STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y" };
const now = new Date("2026-10-21T00:00:00Z");
const future = new Date("2026-11-21T00:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");

describe("entitlements", () => {
  it("no subscription => free", () => expect(planFor(null, env, now)).toBe("free"));
  it("active/trialing pro price => pro", () => {
    expect(planFor({ status: "active", priceId: "price_m", currentPeriodEnd: future }, env, now)).toBe("pro");
    expect(planFor({ status: "trialing", priceId: "price_y", currentPeriodEnd: future }, env, now)).toBe("pro");
  });
  it("unknown price id => free even if active", () =>
    expect(planFor({ status: "active", priceId: "price_other", currentPeriodEnd: future }, env, now)).toBe("free"));
  it("past_due keeps pro only within the period", () => {
    expect(planFor({ status: "past_due", priceId: "price_m", currentPeriodEnd: future }, env, now)).toBe("pro");
    expect(planFor({ status: "past_due", priceId: "price_m", currentPeriodEnd: past }, env, now)).toBe("free");
  });
  it("canceled/unpaid/incomplete => free", () => {
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"])
      expect(planFor({ status, priceId: "price_m", currentPeriodEnd: future }, env, now), status).toBe("free");
  });
  it("free cannot link a bank; pro can", () => {
    expect(can("free", "link_bank")).toBe(false);
    expect(can("pro", "link_bank")).toBe(true);
    expect(() => assertCan("free", "live_insights")).toThrow(EntitlementError);
  });
  it("no env prices configured => everyone free", () =>
    expect(planFor({ status: "active", priceId: "price_m", currentPeriodEnd: future }, {}, now)).toBe("free"));
});
