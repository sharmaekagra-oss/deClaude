// POST /api/rewrite  { text }  ->  { rewrite, changes, kept, before, after, ... }
// Vercel serverless function. API keys live only in environment variables.
//
// Four providers, same SKILL.md and same JSON output:
//   groq        needs GROQ_API_KEY        (models: GROQ_MODELS; free tier, fastest)
//   gemini      needs GOOGLE_API_KEY      (models: GEMINI_MODEL + GEMINI_FALLBACKS; free tier)
//   openrouter  needs OPENROUTER_API_KEY  (models: OPENROUTER_MODELS; free ":free" models)
//   claude      needs ANTHROPIC_API_KEY   (model: CLAUDE_MODEL, default claude-opus-5-5)
// PROVIDER is an ordered, comma-separated list, e.g. "groq,gemini,openrouter". When a provider
// is out of quota or overloaded, the next one takes over. If unset, every provider with a key is
// used, in the order claude, groq, gemini, openrouter.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ApiError as GoogleApiError } from "@google/genai";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detect, score, PATTERNS, preservationIssues, droppedSentences, isSlides, SLIDE_MARK } from "../app/detectors.js";

const list = (v, d) => (v || d).split(",").map((s) => s.trim()).filter(Boolean);

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "medium";
const GOOGLE_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_THINKING = (process.env.GEMINI_THINKING || "LOW").toUpperCase();
const GEMINI_MODELS = [...new Set([GEMINI_MODEL, ...list(process.env.GEMINI_FALLBACKS, "gemini-flash-latest,gemini-3.5-flash,gemini-flash-lite-latest")])];
// Free models that can return JSON, checked against each provider on 2026-10-13.
const OPENROUTER_MODELS = list(process.env.OPENROUTER_MODELS, "nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free");
// qwen/qwen3.8-27b and openai/gpt-oss-20b also work, but in testing Qwen cut a rewrite off
// mid-sentence and dropped facts, and gpt-oss-20b barely edited. Add them back via GROQ_MODELS.
const GROQ_MODELS = list(process.env.GROQ_MODELS, "openai/gpt-oss-120b");
const MAX_CHARS = 12000;
// Any single AI call is abandoned after this long, and a whole request stops trying new models
// after REQUEST_BUDGET, so users get an answer (even "busy") well inside Vercel's 300 s limit.
const CALL_TIMEOUT = Number(process.env.CALL_TIMEOUT_MS || 60_000);
const REQUEST_BUDGET = Number(process.env.REQUEST_BUDGET_MS || 200_000);
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 30);
// "hard" (default): a second pass only for hard failures. "all": also for weaker leftovers and lost register.
const REPAIR_MODE = (process.env.REPAIR_MODE || "hard").toLowerCase();

// Patterns that trigger the repair pass. Em dashes are fixed in code, so they aren't here.
const HARD_FIX = new Set(["chatbot-residue", "stock-openers", "template-phrases", "generic-closer", "punchy-closer", "bold-labels", "uniform-rhythm"]);
const ALL_FIX = new Set([...HARD_FIX, "ai-vocab", "promo-language", "hedge-stack", "not-x-but-y", "ing-tail", "self-answer", "significance-inflation", "vague-attribution", "heading-style"]);

// SKILL.md is the single source of truth for the rewrite rules.
const SKILL = readFileSync(path.join(process.cwd(), "skill", "SKILL.md"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/^---[\s\S]*?---\s*/, "");
// Free tiers cap tokens per minute, so Groq and OpenRouter get SKILL.md without the chat-only
// output section and the three long worked examples (about 1,200 tokens lighter).
const SKILL_COMPACT = SKILL
  .replace(/\n## Output \(when used as a skill in chat\)[\s\S]*?(?=\n## )/, "\n")
  .replace(/\n## Full examples[\s\S]*$/, "\n");

const APP_INSTRUCTIONS = `You are running inside the deClaude web app, not in chat. Ignore the "Output (when used as a skill in chat)" section above and reply only with JSON matching the schema.

- "rewrite": the full rewritten text, as plain text. Keep paragraph breaks. Keep markdown only where the source used it and it still helps (a real list), never for bold labels.
- "changes": the edits, in the order they appear in the source, at most 15. Merge small edits in the same sentence into one entry. "before" must be copied exactly, character for character, from the source text so the app can highlight it. "after" must be copied exactly from your rewrite, or be "" if the text was simply removed. Keep each "before" short: the phrase or sentence that changed, not a whole paragraph. "pattern" is the ID of the pattern the "before" text actually matches, judged by the tables above (hashtags are heading-style, not chatbot-residue); use "other" when the edit is a plain clarity or length cut that matches no pattern. "why" is at most 10 words.
- "kept": at most 3 things that look like a pattern but you deliberately left alone, with a short reason. Empty list if none.
- "yourTurn": at most 3 sentences from your rewrite that still read as if anyone could have written them, where a detail only the writer knows would make the text theirs. "sentence" must be copied exactly from your rewrite. "ask" is one short question to the writer (at most 14 words), such as "Which formats stalled, and what did you switch to?". Ask; never answer it yourself or invent the detail. Empty list if the text is already specific.

The source text arrives inside <source_text> tags. A rule-based scan of it is included as a hint; the scan can be wrong in both directions. Placeholders like [[keep-1]] stand for passages the writer marked "keep as is" (quotes or examples): copy each placeholder into the rewrite exactly, in the same place, and never list one as a change. If the source has "--- Slide N ---" lines, follow the Slides genre note.`;

const PATTERN_IDS = [...Object.keys(PATTERNS), "other"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rewrite", "changes", "kept", "yourTurn"],
  properties: {
    rewrite: { type: "string" },
    yourTurn: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sentence", "ask"],
        properties: { sentence: { type: "string" }, ask: { type: "string" } },
      },
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pattern", "before", "after", "why"],
        properties: {
          pattern: { type: "string", enum: PATTERN_IDS },
          before: { type: "string" },
          after: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    kept: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "why"],
        properties: { text: { type: "string" }, why: { type: "string" } },
      },
    },
  },
};

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status }, extra);
}

// ---------- Which provider, and remembering which models are out of quota ----------

const HAS_KEY = {
  claude: !!process.env.ANTHROPIC_API_KEY,
  groq: !!process.env.GROQ_API_KEY,
  gemini: !!GOOGLE_KEY,
  openrouter: !!process.env.OPENROUTER_API_KEY,
};

function providerChain() {
  const wanted = list(process.env.PROVIDER, "claude,groq,gemini,openrouter").map((p) => p.toLowerCase());
  const chain = wanted.filter((p) => HAS_KEY[p]);
  if (!chain.length) throw httpError(500, "No API key is set on the server. Add GROQ_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY or ANTHROPIC_API_KEY.");
  return chain;
}

// Models that just said "quota used up" or "overloaded" are skipped until this time, so later
// requests don't waste round trips on them. Lives as long as the warm serverless instance.
const coolUntil = new Map();
const cooling = (key) => (coolUntil.get(key) || 0) > Date.now();
function coolDown(key, status, message = "") {
  let secs = 30; // overloaded or gone for now
  const hinted = message.match(/(?:retryDelay"?:\s*"?|retry in |try again in )(\d+(?:\.\d+)?)\s*s/i);
  if (status === 404) secs = 6 * 3600;
  else if (status === 429) secs = hinted ? Number(hinted[1]) : /per[- ]?day/i.test(message) ? 3600 : 60;
  coolUntil.set(key, Date.now() + Math.min(secs, 24 * 3600) * 1000);
}

const RETRY_STATUS = [404, 408, 413, 429, 500, 502, 503, 504];
const isTimeout = (err) => err?.name === "TimeoutError" || err?.name === "AbortError";

// Quota, overload, timeout and "model gone" errors mean another provider might still work.
function isRetryable(err) {
  if (isTimeout(err)) return true;
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIError) return err.status >= 500;
  if (err instanceof GoogleApiError) return RETRY_STATUS.includes(err.status);
  return !!err.retryable;
}

// Time left for one call, capped by the request's overall deadline.
function callSignal(deadline) {
  const left = Math.min(CALL_TIMEOUT, deadline - Date.now());
  if (left < 5000) throw httpError(503, "Ran out of time trying free models.", { retryable: true, outOfTime: true });
  return AbortSignal.timeout(left);
}

// ---------- Providers. Each session keeps its conversation for the repair pass. ----------

let anthropic;
function claudeSession() {
  anthropic ??= new Anthropic();
  const messages = [];
  return {
    model: CLAUDE_MODEL,
    async send(text) {
      messages.push({ role: "user", content: text });
      const stream = anthropic.beta.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: CLAUDE_EFFORT, format: { type: "json_schema", schema: SCHEMA } },
        system: [
          { type: "text", text: SKILL, cache_control: { type: "ephemeral" } },
          { type: "text", text: APP_INSTRUCTIONS },
        ],
        messages,
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw httpError(422, "The model declined to rewrite this text.");
      if (msg.stop_reason === "max_tokens") throw httpError(413, "The text is too long to rewrite in one go. Try a shorter piece.");
      messages.push({ role: "assistant", content: msg.content }); // keep thinking blocks for the follow-up
      return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    },
  };
}

let google;
function geminiSession(deadline) {
  google ??= new GoogleGenAI({ apiKey: GOOGLE_KEY });
  const contents = [];
  const session = {
    model: GEMINI_MODEL,
    async send(text) {
      contents.push({ role: "user", parts: [{ text }] });
      let res, lastErr;
      // Stay on the model that answered the first pass, so the repair pass has the same voice.
      const order = [session.model, ...GEMINI_MODELS.filter((m) => m !== session.model)];
      for (const model of order) {
        if (cooling(`gemini:${model}`)) continue;
        try {
          res = await google.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: `${SKILL}\n\n${APP_INSTRUCTIONS}`,
              responseMimeType: "application/json",
              responseJsonSchema: SCHEMA,
              thinkingConfig: { thinkingLevel: GEMINI_THINKING }, // MINIMAL, LOW, MEDIUM or HIGH
              abortSignal: callSignal(deadline),
            },
          });
          session.model = model;
          break;
        } catch (err) {
          lastErr = err;
          if (err.outOfTime) throw err;
          if (isTimeout(err)) { coolDown(`gemini:${model}`, 503); continue; }
          if (!(err instanceof GoogleApiError) || !RETRY_STATUS.includes(err.status)) throw err;
          coolDown(`gemini:${model}`, err.status, err.message);
        }
      }
      if (!res) throw lastErr || httpError(503, "All Gemini models are cooling down.", { retryable: true });
      const reason = res.candidates?.[0]?.finishReason;
      if (reason === "MAX_TOKENS") throw httpError(413, "The text is too long to rewrite in one go. Try a shorter piece.");
      if (!res.text) throw httpError(422, `The model returned no text${reason ? ` (${reason})` : ""}.`);
      contents.push({ role: "model", parts: [{ text: res.text }] });
      return JSON.parse(res.text);
    },
  };
  return session;
}

// Groq and OpenRouter both speak the OpenAI chat format.
const COMPAT = {
  groq: {
    label: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => process.env.GROQ_API_KEY,
    models: GROQ_MODELS,
    headers: {},
    // Less reasoning = much faster. Qwen takes "none", gpt-oss takes "low".
    speed: (model) => (model.startsWith("qwen/") ? { reasoning_effort: "none" } : { reasoning_effort: "low" }),
  },
  openrouter: {
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY,
    models: OPENROUTER_MODELS,
    headers: { "HTTP-Referer": "https://declaude-nine.vercel.app", "X-Title": "deClaude" },
    speed: () => ({ reasoning: { effort: "low" } }),
  },
};

function compatSession(name, deadline) {
  const cfg = COMPAT[name];
  const system = `${SKILL_COMPACT}\n\n${APP_INSTRUCTIONS}`;
  // The schema text is only needed when the model can't take it as response_format.
  const systemWithSchema = `${system}\n\nReply with a single JSON object that matches this JSON Schema:\n${JSON.stringify(SCHEMA)}`;
  const messages = []; // conversation without the system message
  const session = {
    model: cfg.models[0],
    async send(text) {
      messages.push({ role: "user", content: text });
      let lastErr;
      const order = [session.model, ...cfg.models.filter((m) => m !== session.model)];
      for (const model of order) {
        if (cooling(`${name}:${model}`)) continue;
        // Try the fast, strict request first; on a 400, relax it step by step.
        const attempts = [
          { response_format: { type: "json_schema", json_schema: { name: "rewrite", strict: true, schema: SCHEMA } }, ...cfg.speed(model) },
          { response_format: { type: "json_schema", json_schema: { name: "rewrite", strict: true, schema: SCHEMA } } },
          { response_format: { type: "json_object" } },
        ];
        for (const extra of attempts) {
          let r;
          try {
            r = await fetch(cfg.url, {
              signal: callSignal(deadline),
              method: "POST",
              headers: { Authorization: `Bearer ${cfg.key()}`, "Content-Type": "application/json", ...cfg.headers },
              body: JSON.stringify({
                model,
                messages: [{ role: "system", content: extra.response_format.type === "json_object" ? systemWithSchema : system }, ...messages],
                max_tokens: 8000,
                ...extra,
              }),
            });
          } catch (err) {
            // Timeouts and dropped connections ("fetch failed") are worth trying elsewhere.
            if (err.outOfTime || !(isTimeout(err) || err instanceof TypeError)) throw err;
            lastErr = httpError(504, `${cfg.label}: ${isTimeout(err) ? "timed out" : "connection failed"}`, { provider: name, retryable: true });
            coolDown(`${name}:${model}`, 503);
            break;
          }
          const body = await r.json().catch(() => ({}));
          const content = body.choices?.[0]?.message?.content;
          if (r.ok && body.choices?.[0]?.finish_reason === "length") {
            // Ran out of output room: the JSON or the rewrite is cut off. Try the next model.
            lastErr = httpError(502, `${cfg.label}: reply was cut off`, { provider: name, retryable: true });
            coolDown(`${name}:${model}`, 503);
            break;
          }
          if (r.ok && content) {
            const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
            messages.push({ role: "assistant", content: json });
            session.model = model;
            return JSON.parse(json);
          }
          const msg = body.error?.message || `HTTP ${r.status}`;
          console.error(`${cfg.label} error`, model, r.status, msg);
          lastErr = httpError(r.ok ? 502 : r.status, `${cfg.label}: ${msg}`, {
            provider: name,
            retryable: !r.ok && RETRY_STATUS.includes(r.status),
            daily: /per[- ]?day/i.test(msg),
          });
          if (r.status === 401 || r.status === 402 || r.status === 403) throw lastErr; // bad key or no credit
          if (r.status !== 400) {
            if (!r.ok) coolDown(`${name}:${model}`, r.status, msg);
            break;
          }
        }
      }
      throw lastErr || httpError(503, `All ${cfg.label} models are cooling down.`, { provider: name, retryable: true });
    },
  };
  return session;
}

const SESSIONS = {
  claude: () => claudeSession(),
  gemini: (deadline) => geminiSession(deadline),
  groq: (deadline) => compatSession("groq", deadline),
  openrouter: (deadline) => compatSession("openrouter", deadline),
};

// ---------- Request handling ----------

// Best-effort limiter. It resets whenever Vercel starts a fresh instance; the providers'
// quotas and spend limits are the real backstop.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function hintList(findings) {
  if (!findings.length) return "The scan found nothing.";
  return findings
    .map((f) => `- ${f.id}${f.doc ? ` (whole text: ${f.note})` : `: "${f.text}"`}`)
    .join("\n");
}

// Replace any dash that survived. The brief requires zero em dashes.
function stripDashes(text) {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/(?<!\d)\s*–\s*(?!\d)/g, ", ")
    .replace(/\s--\s/g, ", ")
    .replace(/,\s*([.,;:!?])/g, "$1");
}

// Keep only well-formed change entries; models occasionally drift from the schema.
function clean(data) {
  const str = (v) => (typeof v === "string" ? v : "");
  return {
    rewrite: str(data?.rewrite),
    changes: (Array.isArray(data?.changes) ? data.changes : [])
      .filter((c) => c && typeof c.before === "string" && c.before.trim())
      .map((c) => ({ pattern: PATTERN_IDS.includes(c.pattern) ? c.pattern : "other", before: c.before, after: str(c.after), why: str(c.why) })),
    kept: (Array.isArray(data?.kept) ? data.kept : []).filter((k) => k && typeof k.text === "string").map((k) => ({ text: k.text, why: str(k.why) })),
    yourTurn: (Array.isArray(data?.yourTurn) ? data.yourTurn : [])
      .filter((y) => y && typeof y.sentence === "string" && y.sentence.trim() && typeof y.ask === "string")
      .slice(0, 3)
      .map((y) => ({ sentence: y.sentence.trim(), ask: y.ask.trim() })),
  };
}

// Catches replies that stop mid-sentence or lose most of the text, which the tell count can't see.
// Short last lines (sign-offs, names, placeholders like [Your name]) are allowed to lack a full stop.
// Word counts work in any script (Hindi, Arabic, Chinese...), not just Latin letters.
// Sentence endings include the Hindi danda (।), CJK full stops (。！？) and Arabic/Urdu marks (؟ ۔).
// Slides end on fragments by design, so only the lost-text check applies to them.
function truncated(original, rewrite) {
  const words = (t) => (t.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
  // Fluffy short posts can rightly lose most of their words, so only judge longer texts.
  if (words(original) >= 80 && words(rewrite) < words(original) * 0.35) return "lost more than 65% of the text";
  if (isSlides(original)) return "";
  const last = rewrite.trim().split("\n").pop().trim();
  if (last.split(/\s+/).length >= 6 && !/[.!?:)\]"'’”…।॥。！？؟۔]$/u.test(last)) return "stops mid-sentence";
  return "";
}

// If the writer spelled a word the British/Indian way ("prioritise", "behaviour") and the model
// Americanised it, put the writer's spelling back.
function keepSpelling(original, rewrite) {
  const theirs = new Map();
  // "-our" only for known words: a generic rule would turn "four" into "for" and back.
  const OUR = "behavi|col|fav|hon|lab|neighb|flav|hum|rum|sav|endeav|harb|vap|arm|od|parl";
  const re = new RegExp(`\\b(?:[A-Za-z]+(?:is(?:e|es|ed|ing|ation|ations)|ys(?:e|es|ed|ing))|(?:${OUR})our(?:s|ed|ing|ite|ites|able)?)\\b`, "gi");
  for (const w of original.match(re) || []) {
    const us = w.replace(/is(e|es|ed|ing|ation|ations)$/, "iz$1").replace(/ys(e|es|ed|ing)$/, "yz$1").replace(/our(s|ed|ing|ite|ites|able)?$/i, "or$1");
    if (us !== w) theirs.set(us.toLowerCase(), w);
  }
  if (!theirs.size) return rewrite;
  return rewrite.replace(/\b[A-Za-z]+\b/g, (w) => {
    const mine = theirs.get(w.toLowerCase());
    if (!mine) return w;
    return w[0] === w[0].toUpperCase() ? mine[0].toUpperCase() + mine.slice(1) : mine.toLowerCase();
  });
}

// "Please try again in 15.1s" (Groq, OpenRouter) or retryDelay "37s" (Gemini), in seconds.
function retryAfterSeconds(err) {
  const m = String(err?.message || "").match(/try again in ([\d.]+)\s*s|retryDelay"?:\s*"?(\d+)s/i);
  return m ? Math.ceil(Number(m[1] || m[2])) : null;
}

const markers = (t) => (t.match(SLIDE_MARK) || []).map((m) => m.trim());

// "Keep as is" passages travel to the model as placeholders ([[keep-1]]) and are put back in code,
// so neither the model nor the clean-up below (dash stripping, spelling) can change them.
function placeholders(keep) {
  const sorted = [...keep].sort((a, b) => b.length - a.length); // longest first, so nested passages work
  return {
    hide: (t) => sorted.reduce((s, k, i) => s.split(k).join(`[[keep-${i + 1}]]`), t),
    show: (t) => t.replace(/\[\[keep-(\d+)\]\]/g, (m, n) => sorted[n - 1] ?? m),
    tokens: (t) => [...new Set(t.match(/\[\[keep-\d+\]\]/g) || [])],
  };
}

// Placeholders and slide markers the writer relies on surviving intact. Both texts are as the model sees them.
function structureIssues(hidden, rewrite, ph) {
  const issues = [];
  const lost = ph.tokens(hidden).filter((tk) => !rewrite.includes(tk));
  if (lost.length) issues.push(`these placeholders stand for passages the writer marked "keep as is" and must appear in the rewrite exactly, in the same place: ${lost.join(", ")}`);
  const want = markers(hidden), got = markers(rewrite);
  if (want.length && want.join("\n") !== got.join("\n")) {
    issues.push(`the source has ${want.length} slide markers (--- Slide 1 --- to --- Slide ${want.length} ---); keep every one exactly, in order, with each slide's content under its own marker`);
  }
  return issues;
}

// Puts the kept passages back everywhere the app shows text from the model.
function reveal(data, ph) {
  return {
    ...data,
    rewrite: ph.show(data.rewrite),
    changes: data.changes.map((c) => ({ ...c, before: ph.show(c.before), after: ph.show(c.after) })),
    kept: data.kept.map((k) => ({ ...k, text: ph.show(k.text) })),
    yourTurn: data.yourTurn.map((y) => ({ ...y, sentence: ph.show(y.sentence) })),
  };
}

async function rewriteWith(session, text, before, deadline, keep = []) {
  const ph = placeholders(keep);
  const hidden = ph.hide(text);
  let data = clean(await session.send(
    `<source_text>\n${hidden}\n</source_text>\n\nRule-based scan of the source:\n${hintList(before.findings)}`,
  ));
  if (!data.rewrite) throw httpError(502, "The AI returned an empty rewrite. Try again.");
  const cut = truncated(hidden, data.rewrite);
  if (cut) throw httpError(502, `The rewrite ${cut}.`, { retryable: true });

  // One repair pass, only when it's worth a second call.
  const fixSet = REPAIR_MODE === "all" ? ALL_FIX : HARD_FIX;
  const draft = ph.show(data.rewrite);
  const leftover = detect(draft, { keep }).filter((f) => fixSet.has(f.id));
  const issues = preservationIssues(text, draft);
  const lostFacts = issues.filter((i) => i.startsWith("numbers"));
  const register = issues.filter((i) => !i.startsWith("numbers"));
  const dropped = droppedSentences(text, draft, { keep }).map((s) => `this sentence from the source has no counterpart in your rewrite: "${ph.hide(s)}". If it carries a fact, reason, instruction or lesson, put that content back. If it was pure filler, leave it out and add it to "kept" with the reason it was cut`);
  const blocking = [...lostFacts, ...dropped, ...structureIssues(hidden, data.rewrite, ph), ...(REPAIR_MODE === "all" ? register : [])];
  let repaired = false;
  let repairSkipped = false;
  if (leftover.length || blocking.length) {
    const problems = [
      leftover.length ? `Your rewrite still contains these patterns:\n${hintList(leftover)}` : "",
      blocking.length ? `Your rewrite breaks the hard rules:\n${blocking.map((l) => `- ${l}`).join("\n")}\nAlso recheck that every list item, action and stated lesson from the source survived.` : "",
    ].filter(Boolean).join("\n\n");
    const ask = `${problems}\n\nFix only these, following the hard rules. Return the same JSON: the full updated rewrite, the changes list measured against the original source text, kept, and yourTurn (its sentences copied from the updated rewrite).`;
    // Free tiers often refuse a second call in the same minute. Wait out a short limit once;
    // if the repair still can't run, keep the first draft instead of failing the whole request.
    for (let attempt = 0; attempt < 2 && !repaired && !repairSkipped; attempt++) {
      try {
        const fixed = clean(await session.send(ask));
        if (fixed.rewrite && !truncated(hidden, fixed.rewrite)) data = fixed;
        repaired = true;
      } catch (err) {
        if (!isRetryable(err)) throw err;
        const wait = retryAfterSeconds(err);
        if (attempt === 0 && wait !== null && wait <= 30 && Date.now() + (wait + 15) * 1000 < deadline) {
          await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
        } else {
          repairSkipped = true;
          console.error("Repair pass skipped:", err.status, err.message);
        }
      }
    }
  }

  let autoFixedDashes = false;
  // Runs while kept passages are still placeholders, so it can't touch them.
  const tidyUp = (t) => {
    // Dashes first: replacing one can leave a double space, which the clean-up below removes.
    if (/—|(?<!\d)–(?!\d)|\s--\s/.test(t)) {
      t = stripDashes(t);
      autoFixedDashes = true;
    }

    // Some models emit non-breaking hyphens/spaces and stray double spaces; normalise them.
    t = t
      .replace(/‑/g, "-")
      .replace(/[  ]/g, " ")
      .replace(/(\S) {2,}(?=\S)/g, "$1 ");
    return keepSpelling(text, t);
  };
  data.rewrite = tidyUp(data.rewrite).replace(/[ \t]+$/gm, "");
  const slidesOff = structureIssues(hidden, data.rewrite, ph).some((s) => s.includes("slide markers"));
  data = reveal(data, ph);

  const lostKeep = keep.filter((k) => !data.rewrite.includes(k));
  const warnings = [
    ...preservationIssues(text, data.rewrite),
    ...droppedSentences(text, data.rewrite, { keep }).map((s) => `this sentence from the original may be missing: "${s}"`),
    ...(lostKeep.length ? [`${lostKeep.length} "keep as is" passage${lostKeep.length > 1 ? "s" : ""} didn't survive: ${lostKeep.map((k) => `"${k.length > 60 ? `${k.slice(0, 57)}...` : k}"`).join(", ")}`] : []),
    ...(slidesOff ? ["the slide markers changed, so some text may have moved to another slide"] : []),
  ];
  return { ...data, before, after: score(data.rewrite, { keep }), repaired, repairSkipped, autoFixedDashes, warnings };
}

// "Keep as is" passages from the client: short strings that actually occur in the text.
function keepList(raw, text) {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter((k) => typeof k === "string").map((k) => k.trim())
    .filter((k) => k.length >= 2 && k.length <= 600 && text.includes(k));
  return [...new Set(out)].slice(0, 40);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const passcode = process.env.APP_PASSCODE;
  if (passcode && req.headers["x-passcode"] !== passcode) {
    return res.status(401).json({ error: "Passcode required.", needsPasscode: true });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many rewrites this hour. Try again later." });

  const text = typeof req.body?.text === "string" ? req.body.text.replace(/\r\n/g, "\n").trim() : "";
  if (!text) return res.status(400).json({ error: "Paste some text first." });
  if (text.length > MAX_CHARS) return res.status(413).json({ error: `Keep it under ${MAX_CHARS.toLocaleString()} characters (about 2,000 words).` });

  const keep = keepList(req.body?.keep, text);
  const before = score(text, { keep });
  const started = Date.now();

  let chain;
  try {
    chain = providerChain();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  let lastErr;
  const tried = [];
  const deadline = started + REQUEST_BUDGET;
  for (const provider of chain) {
    try {
      const session = SESSIONS[provider](deadline);
      const result = await rewriteWith(session, text, before, deadline, keep);
      return res.status(200).json({
        ...result,
        provider,
        model: session.model,
        fellBackFrom: tried,
        seconds: Math.round((Date.now() - started) / 1000),
      });
    } catch (err) {
      lastErr = err;
      tried.push(provider);
      if (!isRetryable(err) || err.outOfTime) break;
      console.error(`${provider} unavailable, trying the next provider:`, err.status, err.message);
    }
  }
  return sendError(res, lastErr, tried);
}

function sendError(res, err, tried) {
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(500).json({ error: "The server's Anthropic API key is missing or invalid." });
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error", err.status, err.message);
    return res.status(err.status === 429 ? 429 : 502).json({ error: `The AI service returned an error (${err.status}).` });
  }
  if (err instanceof SyntaxError) {
    return res.status(502).json({ error: "The AI reply wasn't valid JSON. Try again." });
  }
  if (err instanceof GoogleApiError && !isRetryable(err)) {
    console.error("Gemini API error", err.status, err.message);
    return res.status(502).json({ error: `Gemini rejected the request (${err.status}). Check GOOGLE_API_KEY and GEMINI_MODEL.` });
  }
  const status = err?.status;
  if (status === 401 || status === 403) {
    return res.status(500).json({ error: `${err.message}. Check the API key for ${err.provider || tried.at(-1)}.` });
  }
  if (isRetryable(err)) {
    // Every provider in the chain was out of quota or overloaded.
    const daily = err.daily || /PerDay|per[- ]?day/i.test(err.message || "");
    return res.status(status === 429 ? 429 : 503).json({
      daily,
      error: daily
        ? "Today's free AI quota is used up on every provider we can try. It resets around midnight US Pacific time."
        : "The free AI models are busy right now. Wait a minute and try again.",
    });
  }
  console.error(err);
  // Never pass raw upstream pages (HTML error screens, JSON dumps) through to the user.
  const msg = err?.message || "";
  const safe = msg && msg.length < 200 && !/[<{]/.test(msg) ? msg : "Something went wrong on the AI service. Try again.";
  return res.status(status || 500).json({ error: safe });
}
