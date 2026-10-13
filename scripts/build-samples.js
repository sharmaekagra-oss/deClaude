// Turns docs/test-report/samples-original.md into app/samples.json for the "Try a sample" menu.
// Run with: node scripts/build-samples.js
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync("docs/test-report/samples-original.md", "utf8").replace(/\r\n/g, "\n");
const samples = [];
for (const part of md.split(/^## /m).slice(1)) {
  const [heading, ...rest] = part.split("\n");
  const body = rest.join("\n").replace(/^\*\*Prompt:\*\*.*\n/m, "").trim();
  samples.push({ label: heading.replace(/^\d+\.\s*/, "").trim(), text: body });
}
writeFileSync("app/samples.json", JSON.stringify(samples, null, 2) + "\n");
console.log(`Wrote ${samples.length} samples: ${samples.map((s) => s.label).join(", ")}`);
