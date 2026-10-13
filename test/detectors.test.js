// Run with: npm test
// Checks each detector fires on a known AI sample and stays quiet on plain human prose.
import { detect, score, PATTERNS } from "../app/detectors.js";
import assert from "node:assert/strict";

const AI = `## 🚀 Unlock Your Team's Full Potential

In today's fast-paced world, collaboration is more than just a buzzword — it's a necessity. Our sleek, intuitive, powerful platform serves as a hub for modern teams. It's not just a tool, it's a movement.

**Speed:** Everything loads instantly.

Moreover, experts say that remote work plays a crucial role in employee happiness, highlighting the importance of flexibility. The result? Happier, healthier, and more productive teams. We could potentially save you hours. Let's dive in!

Whether you're a startup or an enterprise, our robust features help you delve into your data. This truly marks a pivotal moment for the industry. I hope this helps! In conclusion, the future looks bright. Let that sink in.`;

const HUMAN = `I moved to Pune in March and spent the first week arguing with my landlord about a broken geyser. He fixed it eventually. The bigger problem was that nobody in my building spoke to me for a month, which I put down to my own shyness until a neighbour invited me to her daughter's birthday. I went, ate too much cake, and met half the floor. Now I know who to ask when the water tank runs dry.`;

const ai = score(AI);
const human = score(HUMAN);
const fired = new Set(ai.findings.map((f) => f.id));

const expected = [
  "em-dash", "bold-labels", "heading-style", "ai-vocab", "stacked-adjectives", "intensifiers",
  "copula-avoidance", "promo-language", "hedge-stack", "rule-of-three", "not-x-but-y",
  "stock-openers", "template-phrases", "transition-overuse", "ing-tail", "self-answer",
  "significance-inflation", "vague-attribution", "chatbot-residue", "generic-closer", "punchy-closer",
];
const missing = expected.filter((id) => !fired.has(id));

console.log(`AI sample: ${ai.total} flags (${ai.per100} per 100 words)`);
for (const f of ai.findings) console.log(`  ${f.id.padEnd(24)} ${JSON.stringify(f.text || f.note)}`);
console.log(`Human sample: ${human.total} flags (${human.per100} per 100 words)`);
for (const f of human.findings) console.log(`  ${f.id.padEnd(24)} ${JSON.stringify(f.text || f.note)}`);

assert.deepEqual(missing, [], `detectors that did not fire: ${missing.join(", ")}`);
assert.ok(human.per100 < 3, "human sample should be nearly clean");
for (const id of fired) assert.ok(PATTERNS[id], `unknown pattern id ${id}`);

// Rhythm detectors
const flat = Array.from({ length: 8 }, (_, i) => `This sentence number ${i} has exactly nine words in it.`).join(" ");
assert.ok(detect(flat).some((f) => f.id === "uniform-rhythm"), "uniform-rhythm should fire");
assert.ok(detect(flat).some((f) => f.id === "repeated-openers"), "repeated-openers should fire");

// Code and URLs are ignored; number ranges keep their en dash
assert.equal(detect("See https://example.com/robust—delve and `leverage()` for 2020–2024.").length, 0);

console.log("\nAll detector checks passed.");
