// Checks that every "After" example in skill/SKILL.md passes our own detectors,
// and every "Before" example trips at least one. (stop-slop's examples broke its own rules; ours shouldn't.)
import { readFileSync } from "node:fs";
import { detect } from "../app/detectors.js";
import assert from "node:assert/strict";

const md = readFileSync(new URL("../skill/SKILL.md", import.meta.url), "utf8");
const lines = md.split(/\r?\n/);
const blocks = [];

for (let i = 0; i < lines.length; i++) {
  const inline = lines[i].match(/^> \*\*(Before|After):\*\* (.+)$/);
  if (inline) { blocks.push({ kind: inline[1], line: i + 1, text: inline[2] }); continue; }
  const head = lines[i].match(/^\*\*(Before|After):\*\*\s*$/);
  if (head) {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    const body = [];
    while (j < lines.length && lines[j].startsWith(">")) body.push(lines[j++].replace(/^> ?/, ""));
    blocks.push({ kind: head[1], line: i + 1, text: body.join("\n") });
  }
}

let failures = 0;
for (const b of blocks) {
  const hits = detect(b.text);
  const ok = b.kind === "After" ? hits.length === 0 : hits.length > 0;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${b.kind.padEnd(6)} line ${String(b.line).padEnd(4)} ${hits.length} flags${hits.length && b.kind === "After" ? ": " + hits.map((h) => `${h.id} "${h.text}"`).join(", ") : ""}`);
}
assert.ok(blocks.filter((b) => b.kind === "After").length >= 8, "expected at least 8 After examples");
assert.equal(failures, 0, `${failures} example(s) broke the rules`);
console.log(`\nAll ${blocks.length} SKILL.md examples pass.`);
