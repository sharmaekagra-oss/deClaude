// Builds the two blind-test forms and the answer key. See docs/blind-test/PROTOCOL.md.
// Usage: node scripts/build-blind-test.js [seed]
import { readFileSync, writeFileSync } from "node:fs";

const seed = Number(process.argv[2] || 2026);
const rand = (() => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32); })();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const originals = JSON.parse(readFileSync("app/samples.json", "utf8"));
const { results } = JSON.parse(readFileSync("docs/test-report/results.json", "utf8"));

const humanMd = readFileSync("docs/blind-test/human-controls.md", "utf8").replace(/\r\n/g, "\n");
const humans = humanMd.split(/^## /m).slice(1).map((part) => {
  const [heading, ...rest] = part.split("\n");
  const body = rest.join("\n").replace(/^\*\*(Prompt|Written by):\*\*.*\n/gm, "").trim();
  return { label: heading.replace(/^\d+\.\s*/, "").trim(), text: body };
});
const missing = humans.filter((h) => !h.text || h.text === "(write here)").map((h) => h.label);
if (missing.length) throw new Error(`Human controls not written yet: ${missing.join(", ")}`);

// Form A gets the original for types 0, 2, 4 and the rewrite for 1, 3. Form B is the reverse.
const plan = { A: ["O", "R", "O", "R", "O"], B: ["R", "O", "R", "O", "R"] };
const key = ["form,piece,content_type,version"];

for (const [form, versions] of Object.entries(plan)) {
  const pieces = originals.map((o, i) => ({
    type: o.label,
    version: versions[i],
    text: versions[i] === "O" ? o.text : results.find((r) => r.label === o.label).rewrite,
  }));
  pieces.push(...humans.map((h) => ({ type: h.label, version: "H", text: h.text })));
  shuffle(pieces);

  let md = `# Form ${form}\n\nFor each piece: (1) Person or AI? (2) How sure are you, 1 to 5? (3) Optional: what gave it away?\n`;
  pieces.forEach((p, i) => {
    md += `\n---\n\n## Piece ${i + 1}\n\n${p.text}\n`;
    key.push(`${form},${i + 1},${p.type},${p.version}`);
  });
  writeFileSync(`docs/blind-test/form-${form}.md`, md);
}
writeFileSync("docs/blind-test/answer-key.csv", key.join("\n") + "\n");
console.log(`Wrote form-A.md, form-B.md and answer-key.csv (seed ${seed}). Keep the answer key away from respondents.`);
