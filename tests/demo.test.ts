import { describe, expect, it } from "vitest";
import { MockProvider, runDemo } from "../src/index.js";

describe("mock end-to-end demo", () => {
  it("runs budgeting + spending + recurring + goals + net worth deterministically", async () => {
    const a = await runDemo(new MockProvider());
    const b = await runDemo(new MockProvider());
    expect(a).toEqual(b);
    expect(a.provider).toBe("mock");
    expect(Object.keys(a).sort()).toEqual(["budget", "goal", "netWorth", "provider", "recurring", "spending"]);
    const budget = a.budget as { report: { overCategories: string[]; month: string } };
    expect(budget.report.month).toBe("2026-09");
    expect(budget.report.overCategories).toContain("dining");
  });
});
