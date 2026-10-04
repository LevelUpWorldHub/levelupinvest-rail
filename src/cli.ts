#!/usr/bin/env node
import { runDemo } from "./demo.js";
import { createProvider } from "./providers/index.js";
import { TOOL_NAMES, buildToolsJson, runTool } from "./tools.js";

function parseValue(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export function parseFlags(argv: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = parseValue(next);
      i++;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { provider, reason } = createProvider();
  if (!cmd || cmd === "help") {
    console.log(`levelupinvest-rail (read-only)\n\nUsage: pnpm cli <command> [--flag value]\n\nCommands:\n  provider   show active provider\n  tools      print tools.json\n  demo       mock end-to-end run\n  ${TOOL_NAMES.join("\n  ")}\n`);
    return;
  }
  if (cmd === "provider") return void console.log(JSON.stringify({ provider: provider.name, reason }, null, 2));
  if (cmd === "tools") return void console.log(JSON.stringify(buildToolsJson(), null, 2));
  if (cmd === "demo") return void console.log(JSON.stringify(await runDemo(provider), null, 2));
  const name = cmd.replace(/-/g, "_");
  console.log(JSON.stringify(await runTool(provider, name, parseFlags(rest)), null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  process.exit(1);
});
