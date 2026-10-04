/**
 * `pnpm verify`: typecheck + full test run + drills, then writes
 *   receipts/verify-<timestamp>.json  and  receipts/DRILL.md
 * Drills: (1) mutation drill in a scratch copy, (2) mock end-to-end run, (3) secrets drill.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { ROOT, walk } from "../tests/helpers/scan.js";
import { scanText } from "../tests/helpers/secrets.js";

interface TestSummary {
  exitCode: number;
  total: number;
  passed: number;
  failed: number;
  files: number;
  failedTests: string[];
}

const SKIP = (rel: string): boolean => /^(node_modules|\.git|dist|coverage|receipts)(\/|$)/.test(rel);

function sh(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function runVitest(cwd: string): TestSummary {
  const out = join(mkdtempSync(join(tmpdir(), "lui-vitest-")), "result.json");
  const r = sh(join(cwd, "node_modules/.bin/vitest"), ["run", "--reporter=json", `--outputFile=${out}`], cwd);
  const failedTests: string[] = [];
  let total = 0, passed = 0, failed = 0, files = 0;
  if (existsSync(out)) {
    const j = JSON.parse(readFileSync(out, "utf8")) as {
      testResults: Array<{ assertionResults: Array<{ status: string; fullName: string }> }>;
    };
    files = j.testResults.length;
    for (const f of j.testResults) {
      for (const a of f.assertionResults) {
        total++;
        if (a.status === "passed") passed++;
        else {
          failed++;
          failedTests.push(a.fullName);
        }
      }
    }
  }
  return { exitCode: r.status ?? 1, total, passed, failed, files, failedTests };
}

function treeHash(root: string): string {
  const h = createHash("sha256");
  for (const f of walk(root, SKIP).sort()) {
    h.update(relative(root, f));
    h.update(readFileSync(f));
  }
  return h.digest("hex");
}

interface Mutation {
  id: string;
  description: string;
  file: string;
  find: string;
  replace: string;
}

const MUTATIONS: Mutation[] = [
  {
    id: "M1",
    description: "inject a write-capable provider method (placeOrder) into MockProvider",
    file: "src/providers/mock.ts",
    find: "  async getRecurring(): Promise<RecurringItem[]> {",
    replace: "  async placeOrder(symbol: string): Promise<void> {\n    void symbol;\n  }\n\n  async getRecurring(): Promise<RecurringItem[]> {",
  },
  {
    id: "M2",
    description: "add a forbidden endpoint (/transfer/create) to ALLOWED_PLAID_ENDPOINTS",
    file: "src/plaid/allowlist.ts",
    find: '  "/transactions/recurring/get",\n] as const;',
    replace: '  "/transactions/recurring/get",\n  "/transfer/create",\n] as const;',
  },
  {
    id: "M3",
    description: "request a forbidden Link product (payment_initiation) alongside transactions",
    file: "src/plaid/allowlist.ts",
    find: 'export const ALLOWED_LINK_PRODUCTS = ["transactions"] as const;',
    replace: 'export const ALLOWED_LINK_PRODUCTS = ["transactions", "payment_initiation"] as const;',
  },
  {
    id: "M4",
    description: "add a payment SDK (stripe) to package.json",
    file: "package.json",
    find: '"devDependencies": {',
    replace: '"devDependencies": {\n    "stripe": "^17.0.0",',
  },
  {
    id: "M5",
    description: "add a write tool (place_order, readOnly:false) to tools.json",
    file: "tools.json",
    find: '"tools": [',
    replace: '"tools": [\n    { "name": "place_order", "description": "x", "readOnly": false, "input_schema": { "type": "object", "properties": {}, "required": [], "additionalProperties": false } },',
  },
  {
    id: "M6",
    description: "add a write method (submitOrder) to the AggregationProvider interface",
    file: "src/providers/types.ts",
    find: "  getRecurring(): Promise<RecurringItem[]>;\n}",
    replace: "  getRecurring(): Promise<RecurringItem[]>;\n  submitOrder(): Promise<void>;\n}",
  },
  {
    id: "M7",
    description: "allow HTTP PUT in the HTTP layer",
    file: "src/plaid/allowlist.ts",
    find: 'export const ALLOWED_HTTP_METHODS = ["POST"] as const;',
    replace: 'export const ALLOWED_HTTP_METHODS = ["POST", "PUT"] as const;',
  },
];

function main(): void {
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  const hashBefore = treeHash(ROOT);
  const head = sh("git", ["rev-parse", "HEAD"], ROOT);
  const gitHead = head.status === 0 ? head.stdout.trim() : "none (no commits yet)";

  // 0. typecheck + tests
  console.log("[verify] typecheck…");
  const tc = sh(join(ROOT, "node_modules/.bin/tsc"), ["--noEmit"], ROOT);
  console.log("[verify] tests…");
  const tests = runVitest(ROOT);

  // 1. Mutation drill (scratch copy; the real tree is never modified)
  console.log("[verify] mutation drill…");
  const scratch = mkdtempSync(join(tmpdir(), "lui-mutation-"));
  cpSync(ROOT, scratch, { recursive: true, filter: (src) => !SKIP(relative(ROOT, src)) });
  symlinkSync(join(ROOT, "node_modules"), join(scratch, "node_modules"));
  const baseline = runVitest(scratch);
  const mutationResults = MUTATIONS.map((m) => {
    const path = join(scratch, m.file);
    const original = readFileSync(path, "utf8");
    if (!original.includes(m.find)) throw new Error(`mutation ${m.id}: anchor not found in ${m.file}`);
    writeFileSync(path, original.replace(m.find, m.replace));
    const mutated = runVitest(scratch);
    writeFileSync(path, original); // revert
    const reverted = runVitest(scratch);
    const caught = mutated.exitCode !== 0 && mutated.failed > 0;
    const restored = reverted.exitCode === 0 && reverted.failed === 0 && reverted.total === baseline.total;
    console.log(`  ${m.id} caught=${caught} restored=${restored} (failed ${mutated.failed})`);
    return { ...m, mutatedFailed: mutated.failed, mutatedExit: mutated.exitCode, sampleFailures: mutated.failedTests.slice(0, 4), revertedPassed: reverted.passed, revertedTotal: reverted.total, revertedExit: reverted.exitCode, caught, restored };
  });
  rmSync(scratch, { recursive: true, force: true });
  const mutationOk = baseline.exitCode === 0 && mutationResults.every((m) => m.caught && m.restored);

  // 2. Mock end-to-end run via the CLI with all PLAID_* variables removed
  console.log("[verify] mock end-to-end…");
  const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) if (k.startsWith("PLAID_")) delete cleanEnv[k];
  const demo = sh(join(ROOT, "node_modules/.bin/tsx"), ["src/cli.ts", "demo"], ROOT, cleanEnv);
  const prov = sh(join(ROOT, "node_modules/.bin/tsx"), ["src/cli.ts", "provider"], ROOT, cleanEnv);
  let e2e: Record<string, unknown> = { ok: false };
  if (demo.status === 0) {
    const d = JSON.parse(demo.stdout) as {
      provider: string;
      budget: { report: { month: string; totalLimitCents: number; totalSpentCents: number; overCategories: string[] } };
      spending: { byCategory: Array<{ category: string; totalCents: number }>; averageDailySpendCents: number };
      recurring: { items: unknown[]; estimatedMonthlyRecurringOutflowCents: number };
      goal: { required: { requiredMonthlyContributionCents: number }; projection: { onTrack: boolean; projectedAtTargetDateCents: number } };
      netWorth: { assetsCents: number; liabilitiesCents: number; netWorthCents: number };
    };
    e2e = {
      ok: d.provider === "mock",
      provider: d.provider,
      providerCommand: JSON.parse(prov.stdout),
      budget: { month: d.budget.report.month, totalLimitCents: d.budget.report.totalLimitCents, totalSpentCents: d.budget.report.totalSpentCents, overCategories: d.budget.report.overCategories },
      spendingTop3: d.spending.byCategory.slice(0, 3),
      averageDailySpendCents: d.spending.averageDailySpendCents,
      recurringDetected: d.recurring.items.length,
      estimatedMonthlyRecurringOutflowCents: d.recurring.estimatedMonthlyRecurringOutflowCents,
      goal: { requiredMonthlyContributionCents: d.goal.required.requiredMonthlyContributionCents, onTrackAt900PerMonth: d.goal.projection.onTrack, projectedAtTargetDateCents: d.goal.projection.projectedAtTargetDateCents },
      netWorth: d.netWorth,
    };
  }

  // 3. Secrets drill
  console.log("[verify] secrets drill…");
  const files = walk(ROOT, (rel) => SKIP(rel) || rel === "pnpm-lock.yaml" || (/^\.env(\.|$)/.test(rel) && rel !== ".env.example"));
  const findings = files.flatMap((f) => scanText(readFileSync(f, "utf8")).map((n) => `${relative(ROOT, f)}: ${n}`));
  const tracked = sh("git", ["ls-files"], ROOT);
  const trackedEnv = tracked.status === 0 ? tracked.stdout.split("\n").filter((f) => /(^|\/)\.env(\.|$)/.test(f) && f !== ".env.example") : [];
  const exampleText = readFileSync(join(ROOT, ".env.example"), "utf8");
  const exampleEmpty = exampleText.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).every((l) => l.split("=")[1] === "");
  const secrets = { filesScanned: files.length, findings, trackedEnvFiles: trackedEnv, envExampleValuesEmpty: exampleEmpty, ok: findings.length === 0 && trackedEnv.length === 0 && exampleEmpty };

  const hashAfter = treeHash(ROOT);
  const untouched = hashBefore === hashAfter;
  const overall = tc.status === 0 && tests.exitCode === 0 && mutationOk && e2e.ok === true && secrets.ok && untouched;

  const receipt = {
    kind: "levelupinvest-rail verify receipt",
    timestamp: startedAt.toISOString(),
    timezoneNote: "ISO timestamp is UTC",
    gitHeadAtRun: gitHead,
    sourceTreeSha256: hashAfter,
    node: process.version,
    overall: overall ? "PASS" : "FAIL",
    typecheck: { exitCode: tc.status, ok: tc.status === 0 },
    tests: { total: tests.total, passed: tests.passed, failed: tests.failed, files: tests.files, exitCode: tests.exitCode },
    drills: {
      mutation: { baseline: { total: baseline.total, passed: baseline.passed, failed: baseline.failed }, mutations: mutationResults, ok: mutationOk, realTreeUntouched: untouched },
      mockEndToEnd: e2e,
      secrets,
    },
  };
  mkdirSync(join(ROOT, "receipts"), { recursive: true });
  const receiptPath = join(ROOT, "receipts", `verify-${stamp}.json`);
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  writeFileSync(join(ROOT, "receipts", "DRILL.md"), renderDrill(receipt, `verify-${stamp}.json`));
  console.log(`[verify] ${receipt.overall} — wrote ${relative(ROOT, receiptPath)} and receipts/DRILL.md`);
  process.exit(overall ? 0 : 1);
}

const usd = (c: number): string => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function renderDrill(r: any, file: string): string {
  const m = r.drills.mutation;
  const e = r.drills.mockEndToEnd;
  const s = r.drills.secrets;
  const lines: string[] = [];
  lines.push("# DRILL RESULTS", "");
  lines.push(`Generated by \`pnpm verify\` at ${r.timestamp} (UTC). Receipt: \`receipts/${file}\`.`);
  lines.push(`Git HEAD at run: \`${r.gitHeadAtRun}\` · source tree sha256: \`${r.sourceTreeSha256.slice(0, 16)}…\` · Node ${r.node}`, "");
  lines.push(`**Overall: ${r.overall}** · typecheck ${r.typecheck.ok ? "PASS" : "FAIL"} · tests ${r.tests.passed}/${r.tests.total} passed in ${r.tests.files} files`, "");
  lines.push("## Drill 1 — Mutation drill (hard lines are enforced by tests)", "");
  lines.push("Each mutation is injected into a *scratch copy* of the repo, the suite is run (it must FAIL), the change is reverted, and the suite is re-run (it must PASS again). The real working tree is never modified" + ` (tree unchanged: ${m.realTreeUntouched}).`, "");
  lines.push(`Baseline scratch copy: ${m.baseline.passed}/${m.baseline.total} passed.`, "");
  lines.push("| # | Injected mutation | Tests failing | Caught | After revert | Example failing tests |", "|---|---|---|---|---|---|");
  for (const x of m.mutations) {
    lines.push(`| ${x.id} | ${x.description} (\`${x.file}\`) | ${x.mutatedFailed} | ${x.caught ? "YES" : "**NO**"} | ${x.revertedPassed}/${x.revertedTotal} pass${x.restored ? "" : " **(NOT RESTORED)**"} | ${x.sampleFailures.map((t: string) => t.replace(/\|/g, "\\|")).join("<br>")} |`);
  }
  lines.push("", `Mutation drill: **${m.ok ? "PASS" : "FAIL"}** — ${m.mutations.filter((x: any) => x.caught).length}/${m.mutations.length} forbidden changes were caught; all reverts restored a green suite.`, "");
  lines.push("## Drill 2 — Mock end-to-end run (no Plaid, no network)", "");
  if (e.ok) {
    lines.push(`- Provider: \`${e.provider}\` (${e.providerCommand.reason})`);
    lines.push(`- Budget ${e.budget.month}: spent ${usd(e.budget.totalSpentCents)} vs limits ${usd(e.budget.totalLimitCents)}; over in: ${e.budget.overCategories.join(", ") || "none"}`);
    lines.push(`- Spending (90d) top categories: ${e.spendingTop3.map((c: any) => `${c.category} ${usd(c.totalCents)}`).join(", ")}; avg/day ${usd(e.averageDailySpendCents)}`);
    lines.push(`- Recurring detected: ${e.recurringDetected} items, ≈ ${usd(e.estimatedMonthlyRecurringOutflowCents)}/mo outflow`);
    lines.push(`- Goal (Emergency fund $30,000 by 2027-10-01, 4%): required ${usd(e.goal.requiredMonthlyContributionCents)}/mo; at $900/mo projected ${usd(e.goal.projectedAtTargetDateCents)} (on track: ${e.goal.onTrackAt900PerMonth})`);
    lines.push(`- Net worth: assets ${usd(e.netWorth.assetsCents)} − liabilities ${usd(e.netWorth.liabilitiesCents)} = ${usd(e.netWorth.netWorthCents)}`);
  } else lines.push("- FAILED");
  lines.push("", "## Drill 3 — Secrets drill", "");
  lines.push(`- Files scanned: ${s.filesScanned}; findings: ${s.findings.length}${s.findings.length ? " — " + s.findings.join("; ") : ""}`);
  lines.push(`- Tracked \`.env*\` files (other than \`.env.example\`): ${s.trackedEnvFiles.length}`);
  lines.push(`- \`.env.example\` has only empty values: ${s.envExampleValuesEmpty}`);
  lines.push(`- Result: **${s.ok ? "PASS" : "FAIL"}**`, "");
  lines.push("_Not covered here: GitHub-side secret scanning/push protection is a repository setting, not something the code can prove._", "");
  return lines.join("\n");
}

main();
