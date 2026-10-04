import { writeFileSync } from "node:fs";
import { buildToolsJson } from "../src/tools.js";

writeFileSync(new URL("../tools.json", import.meta.url), JSON.stringify(buildToolsJson(), null, 2) + "\n");
console.log("wrote tools.json");
