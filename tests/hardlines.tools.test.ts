import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOL_NAMES, TOOLS, buildToolsJson } from "../src/index.js";
import { findViolations } from "./helpers/scan.js";

const EXPECTED = [
  "budget_status", "detect_recurring", "get_balances", "get_recurring", "goal_projection", "goal_required_contribution",
  "goal_what_if", "list_accounts", "list_institutions", "list_transactions", "net_worth", "search_institutions", "spending_summary",
];
const READ_PREFIX = /^(list|get|search|detect|budget|spending|goal|net)_/;
const WRITE_WORDS = /(place|submit|execute|transfer|pay|send|wire|initiate|cancel|modify|update|delete|remove|write|create|trade|order|buy|sell|withdraw|deposit|move|ach)/i;

describe("HARD LINES (d): tools.json exposes only read tools", () => {
  const file = JSON.parse(readFileSync(new URL("../tools.json", import.meta.url), "utf8")) as {
    readOnly: boolean;
    mode: string;
    tools: Array<{ name: string; readOnly: boolean; description: string; input_schema: Record<string, unknown> }>;
  };

  it("tools.json is in sync with src/tools.ts (regenerate with pnpm gen:tools)", () => {
    expect(file).toEqual(JSON.parse(JSON.stringify(buildToolsJson())));
  });

  it("exposes exactly the approved read-only tool set", () => {
    expect(file.tools.map((t) => t.name).sort()).toEqual(EXPECTED);
    expect([...TOOL_NAMES].sort()).toEqual(EXPECTED);
  });

  it("rail is flagged read-only/inform", () => {
    expect(file.readOnly).toBe(true);
    expect(file.mode).toBe("inform");
  });

  for (const t of EXPECTED) {
    it(`tool ${t}: read-only name/description/schema`, () => {
      const tool = file.tools.find((x) => x.name === t)!;
      expect(tool.readOnly).toBe(true);
      expect(tool.name).toMatch(READ_PREFIX);
      expect(WRITE_WORDS.test(tool.name)).toBe(false);
      expect(findViolations(JSON.stringify(tool))).toEqual([]);
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.additionalProperties).toBe(false);
    });
  }

  it("every registered tool has a handler, and no tool schema has a write-ish property", () => {
    for (const t of TOOLS) {
      expect(typeof t.run).toBe("function");
      const props = Object.keys((t.inputSchema.properties ?? {}) as object);
      for (const p of props) expect(WRITE_WORDS.test(p) && !/^(startDate|endDate)$/.test(p), `${t.name}.${p}`).toBe(false);
    }
  });
});
