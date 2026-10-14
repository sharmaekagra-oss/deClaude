// Edge cases for /api/rewrite input handling and the detectors. No AI calls are made:
// every case here is rejected (or scored) before a provider is contacted.
// Run with: node test/api-edge.test.js
import assert from "node:assert/strict";
import { detect, score, droppedSentences, preservationIssues } from "../app/detectors.js";

// Isolate from any real keys so nothing can reach a provider.
for (const k of ["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "PROVIDER"]) delete process.env[k];
process.env.APP_PASSCODE = "pass123";
process.env.RATE_LIMIT_PER_HOUR = "5";
const { default: handler } = await import("../api/rewrite.js");

let ip = 0;
function call({ method = "POST", body, pass = "pass123", headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { status(c) { this.c = c; return this; }, json(o) { resolve({ status: this.c, body: o }); } };
    handler({ method, body, headers: { "x-passcode": pass, "x-forwarded-for": `10.0.0.${++ip}`, ...headers } }, res);
  });
}

const cases = [
  ["GET is refused", { method: "GET" }, 405],
  ["missing passcode", { body: { text: "Hello there friend." }, pass: null }, 401],
  ["empty passcode", { body: { text: "Hello there friend." }, pass: "" }, 401],
  ["wrong passcode", { body: { text: "Hello there friend." }, pass: "nope" }, 401],
  ["passcode is case-sensitive", { body: { text: "Hello there friend." }, pass: "PASS123" }, 401],
  ["no body", { body: undefined }, 400],
  ["text missing", { body: {} }, 400],
  ["text is a number", { body: { text: 12345 } }, 400],
  ["text is an array", { body: { text: ["a", "b"] } }, 400],
  ["text is an object", { body: { text: { evil: true } } }, 400],
  ["only whitespace", { body: { text: "   \n\t  \r\n " } }, 400],
  ["over the limit", { body: { text: "a".repeat(12001) } }, 413],
  ["over the limit after CRLF is counted", { body: { text: "word ".repeat(2401) } }, 413],
  ["valid text but no provider keys", { body: { text: "This is a perfectly fine sentence to rewrite today." } }, 500],
];
for (const [name, opts, want] of cases) {
  const { status, body } = await call(opts);
  assert.equal(status, want, `${name}: got ${status} ${JSON.stringify(body)}`);
  assert.equal(typeof body.error, "string", `${name}: error message missing`);
  assert.ok(!/[<{]/.test(body.error), `${name}: error leaks markup: ${body.error}`);
  console.log(`ok   ${String(status).padEnd(4)} ${name}: ${body.error}`);
}

// Exactly at the limit is accepted (it then fails only for lack of a key).
assert.equal((await call({ body: { text: "a".repeat(12000) } })).status, 500, "12,000 chars should pass validation");
console.log("ok        exactly 12,000 characters passes validation");

// Rate limit: same IP, 6th request in an hour is refused.
let last;
for (let i = 0; i < 6; i++) last = await call({ body: { text: "Hello there friend, how are you." }, headers: { "x-forwarded-for": "10.9.9.9" } });
assert.equal(last.status, 429);
console.log(`ok   429  rate limit after 5 requests: ${last.body.error}`);

// Detectors on awkward input: must not throw, and must stay sensible.
const weird = {
  empty: "",
  numbers: "12345 67890 3.14",
  emoji: "🚀🚀🚀 Launch day! ✨ We did it 🎉",
  rtl: "مرحبا بالعالم. هذا نص عربي للاختبار.",
  hindi: "नमस्ते दुनिया। यह एक परीक्षण वाक्य है।",
  cjk: "这是一个测试。我们正在检查。",
  html: "<script>alert('x')</script> <b>bold</b> & co.",
  regexChars: "Price (USD) is $5.00 [approx] {maybe} *star* +plus ?q ^caret |pipe \\back",
  longLine: "word ".repeat(3000),
  onlyPunct: "... !!! ??? --- ***",
  codeBlock: "Use this:\n```\nconst robust = leverage() — delve;\n```\nThat is all.",
  url: "See https://example.com/delve-into-robust-synergy — and more.",
};
for (const [name, text] of Object.entries(weird)) {
  const s = score(text);
  assert.ok(Number.isFinite(s.total) && Number.isFinite(s.per100), `${name}: bad score`);
  droppedSentences(text, text);
  preservationIssues(text, text);
  console.log(`ok        detectors on ${name.padEnd(10)} -> ${s.total} tells`);
}
// Code and URLs are masked, but the em dash outside them still counts.
assert.equal(detect(weird.codeBlock).filter((f) => f.id !== "em-dash").length, 0, "code block should be masked");
assert.equal(detect(weird.url).filter((f) => f.id === "ai-vocab").length, 0, "URL words should be masked");
assert.equal(detect(weird.url).filter((f) => f.id === "em-dash").length, 1, "em dash outside URL counts");
// Word counts work in non-Latin scripts (Hindi used to count as 0 words).
assert.equal(score(weird.hindi).words, 7, "Hindi words counted");
assert.ok(score(weird.cjk).words >= 2, "Chinese text counted");
// A rewrite identical to the source loses nothing.
assert.equal(droppedSentences(weird.hindi, weird.hindi).length, 0);

console.log("\nAll API and detector edge cases passed.");
