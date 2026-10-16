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

// Reworded tells that slipped past the first Gemini run
const has = (t, id) => detect(t).some((f) => f.id === id);
assert.ok(has("Your job is no longer to be the best at the work, but to build a team.", "not-x-but-y"));
assert.ok(has("Why First-Time Managers Struggle to Delegate\n\nMost people get promoted.", "heading-style"));
assert.ok(!has("Subject: Request To Move The Deadline\n\nHi Neha,", "heading-style"), "email subject lines are not titles");
const post = "One year done.\n\nI learned a lot.\n\nThanks to everyone.\n\nIf you went to business school, what do you wish you had known?";
assert.ok(has(post, "generic-closer"), "closing engagement question");
assert.ok(!has("Hi Neha,\n\nCan we move it?\n\nCan you make it?\n\nBest,\nArjun", "generic-closer"), "short email question is fine");

// Fact and register checks
import { preservationIssues } from "../app/detectors.js";
assert.equal(preservationIssues("750 ml for ₹1,299", "750 ml for ₹1,299").length, 0);
assert.match(preservationIssues("Grew 40% in 12 weeks", "Grew 40% quickly")[0], /12/);
assert.equal(preservationIssues("I'm sure it's fine and I don't mind, we're ok", "I am sure it is fine and I do not mind, we are ok").length, 1);

// Dropped-sentence check: real losses from the test runs, and a faithful rewrite
import { droppedSentences } from "../app/detectors.js";
const email = "Hi Neha,\n\nI wanted to check about the deadline. The client sent over a new set of requirements yesterday, and a few of them change the scope.\n\nBest,\nA";
assert.ok(droppedSentences(email, "Hi Neha,\n\nCan we move the deadline to Wednesday?\n\nBest,\nA").some((s) => s.startsWith("The client sent")), "lost reason is caught");
assert.ok(!droppedSentences(email, "Hi Neha,\n\nThe client sent new requirements yesterday that change the scope, so can we move the deadline?\n\nBest,\nA").some((s) => s.startsWith("The client sent")), "reworded reason is fine");
assert.equal(droppedSentences("Hand wash only. Not suitable for microwave or freezer.", "Hand wash only.").length, 1, "lost instruction is caught");
assert.equal(droppedSentences("In today's fast-paced world, teams need tools. We sell a planner.", "We sell a planner.").length, 0, "cutting a sentence with a tell is allowed");

// "Keep as is": quotes and examples aren't counted
const quoting = "Our slide lists tells like delve, robust and seamless as examples.";
assert.ok(detect(quoting).some((f) => f.id === "ai-vocab"));
assert.equal(detect(quoting, { keep: ["delve, robust and seamless"] }).length, 0, "kept passage is not flagged");
assert.equal(score(quoting, { keep: ["not in the text"] }).total, detect(quoting).length, "keep that isn't in the text changes nothing");

// Tuning: headings, names and articles are not tells
assert.ok(!has("Claude Code for research. Groq, Gemini and OpenRouter run the rewrites.", "rule-of-three"), "a list of names");
assert.ok(has("Happier, healthier, and more productive teams.", "rule-of-three"), "a rhetorical triad still fires");
assert.ok(!has("The brief\nThe app\nThe results\nWe built it in a week.", "repeated-openers"), "heading lines are not sentences");
assert.ok(!has("The app is free. The model is slow. The test ran twice.", "repeated-openers"), "'The' alone is ordinary");
assert.ok(has("This is fast. This is cheap. This is easy.", "repeated-openers"), "This... This... This... still fires");

// Slides: markers are ignored, labels with lists don't count, rhythm isn't judged
const deck = ["--- Slide 1 ---", "Keep every fact, list item and lesson", "Scan, rewrite and check", "--- Slide 2 ---",
  ...Array.from({ length: 7 }, (_, i) => `Point ${i} has exactly the same length as the rest.`)].join("\n");
assert.ok(!detect(deck).some((f) => ["rule-of-three", "uniform-rhythm"].includes(f.id)), "slide labels and rhythm");
assert.ok(has("--- Slide 1 ---\nOur sleek, modern, and intuitive kettle.", "stacked-adjectives"), "word-level tells still fire on slides");

// Slide lines that vanish, and quotations suggested as "keep as is"
import { droppedLines, quotations } from "../app/detectors.js";
const slide = "--- Slide 1 ---\nLooking forward to what year two brings.\ngeneric closer\nhashtag row\n#MBA #BusinessSchool #Learning #FirstYear";
assert.deepEqual(droppedLines(slide, "--- Slide 1 ---\nhashtag row"), ["generic closer"], "a cut label is caught; cut tells are allowed");
assert.equal(droppedLines("Not slides.\nA label", "Not slides.").length, 0, "only judged on slides");
assert.deepEqual(quotations(`It says "Speed, quality, cost—pick two." and “keep it”. A 5" screen.`), [`"Speed, quality, cost—pick two."`, "“keep it”"]);

console.log("\nAll detector checks passed.");
