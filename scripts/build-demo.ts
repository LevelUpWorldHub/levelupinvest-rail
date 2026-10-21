// Builds the static mock-data demo into demo/data.json. Always uses MockProvider (no Plaid, no env vars).
import { writeFileSync } from "node:fs";
import { runDemo } from "../src/demo.js";
import { MockProvider } from "../src/providers/mock.js";

const data = await runDemo(new MockProvider());
writeFileSync(new URL("../demo/data.json", import.meta.url), JSON.stringify(data, null, 2) + "\n");
console.log("wrote demo/data.json (provider:", (data as { provider: string }).provider + ")");
