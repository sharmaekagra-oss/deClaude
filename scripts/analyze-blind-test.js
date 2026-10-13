// Scores real blind-test responses against the answer key and writes docs/blind-test/results.md.
// Usage: node scripts/analyze-blind-test.js
//
// Expected CSV (one per form, exported from Google Forms then tidied to this shape):
//   respondent,piece,answer,confidence,reason
//   RS,1,AI,4,too many groups of three
// "answer" is "AI" or "Person". "piece" is the piece number on that form.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const dir = "docs/blind-test";
const parseCsv = (txt) => {
  const rows = [];
  for (const line of txt.replace(/\r\n/g, "\n").trim().split("\n")) {
    const cells = [];
    let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
};

const key = parseCsv(readFileSync(`${dir}/answer-key.csv`, "utf8"));
const judgments = [];
const people = new Set();
for (const form of ["A", "B"]) {
  const file = `${dir}/responses-${form}.csv`;
  if (!existsSync(file)) continue;
  for (const r of parseCsv(readFileSync(file, "utf8"))) {
    const k = key.find((x) => x.form === form && x.piece === r.piece);
    if (!k) throw new Error(`No answer key for form ${form} piece ${r.piece}`);
    people.add(`${form}:${r.respondent}`);
    judgments.push({ ...k, saidAI: /^ai$/i.test(r.answer), confidence: Number(r.confidence) || null, reason: r.reason });
  }
}
if (!judgments.length) throw new Error("No responses found. Add responses-A.csv and/or responses-B.csv first.");

const NAMES = { O: "Original Claude output", R: "deClaude rewrite", H: "Human-written" };
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "n/a"; };

let md = `# Blind test results\n\n${people.size} respondents, ${judgments.length} judgments. All responses are real; see PROTOCOL.md for the design.\n\n## Called "AI", by version\n\n| Version | Judged "AI" | Judgments | Avg. confidence |\n|---|---|---|---|\n`;
for (const v of ["O", "R", "H"]) {
  const j = judgments.filter((x) => x.version === v);
  md += `| ${NAMES[v]} | ${pct(j.filter((x) => x.saidAI).length, j.length)} | ${j.length} | ${avg(j.map((x) => x.confidence))} |\n`;
}
md += `\n## By content type (share judged "AI")\n\n| Content type | Original | Rewrite | Human |\n|---|---|---|---|\n`;
for (const type of [...new Set(key.map((k) => k.content_type))]) {
  const cell = (v) => { const j = judgments.filter((x) => x.content_type === type && x.version === v); return `${pct(j.filter((x) => x.saidAI).length, j.length)} (n=${j.length})`; };
  md += `| ${type} | ${cell("O")} | ${cell("R")} | ${cell("H")} |\n`;
}
md += `\n## What gave it away (free text, verbatim)\n\n`;
for (const v of ["O", "R", "H"]) {
  const reasons = judgments.filter((x) => x.version === v && x.saidAI && x.reason).map((x) => `- ${x.reason}`);
  md += `**${NAMES[v]}, when judged "AI":**\n\n${reasons.join("\n") || "- (none given)"}\n\n`;
}
md += `## Limits\n\nSmall sample of classmates from one course, short pieces, and respondents who may know the topic. Treat percentages as indicative, not significant, unless the sample is much larger.\n`;
writeFileSync(`${dir}/results.md`, md);
console.log(md);
