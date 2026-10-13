// POST /api/rewrite  { text }  ->  { rewrite, changes, kept, before, after, ... }
// Vercel serverless function. API keys live only in environment variables.
//
// Three providers, same SKILL.md and same JSON output:
//   claude      needs ANTHROPIC_API_KEY   (model: CLAUDE_MODEL, default claude-opus-5-5)
//   gemini      needs GOOGLE_API_KEY      (model: GEMINI_MODEL, default gemini-3.8-flash; free tier)
//   openrouter  needs OPENROUTER_API_KEY  (models: OPENROUTER_MODELS, free ":free" models by default)
// PROVIDER is an ordered, comma-separated list, e.g. "gemini,openrouter". When one provider is
// out of quota or overloaded, the next one takes over. If unset, every provider with a key is
// used, in the order claude, gemini, openrouter.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ApiError as GoogleApiError } from "@google/genai";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detect, score, PATTERNS, preservationIssues } from "../app/detectors.js";

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "medium";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_THINKING = (process.env.GEMINI_THINKING || "LOW").toUpperCase();
const GEMINI_FALLBACKS = (process.env.GEMINI_FALLBACKS || "gemini-flash-latest,gemini-3.5-flash,gemini-flash-lite-latest").split(",").map((s) => s.trim()).filter(Boolean);
const GOOGLE_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
// Free models that can return JSON, checked against openrouter.ai/api/v1/models on 2026-10-13.
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || "nvidia/nemotron-3-super-120b-a12b:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_CHARS = 12000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 30);

// Patterns that must not survive a rewrite. The weaker ones are left to judgment.
const MUST_FIX = new Set([
  "em-dash", "ai-vocab", "promo-language", "hedge-stack", "not-x-but-y", "stock-openers",
  "template-phrases", "ing-tail", "self-answer", "significance-inflation", "vague-attribution",
  "chatbot-residue", "generic-closer", "punchy-closer", "bold-labels", "heading-style",
]);

// SKILL.md is the single source of truth for the rewrite rules.
const SKILL = readFileSync(path.join(process.cwd(), "skill", "SKILL.md"), "utf8")
  .replace(/^---[\s\S]*?---\s*/, "");

const APP_INSTRUCTIONS = `You are running inside the deClaude web app, not in chat. Ignore the "Output (when used as a skill in chat)" section above and reply only with JSON matching the schema.

- "rewrite": the full rewritten text, as plain text. Keep paragraph breaks. Keep markdown only where the source used it and it still helps (a real list), never for bold labels.
- "changes": one entry per edit, in the order they appear in the source. "before" must be copied exactly, character for character, from the source text so the app can highlight it. "after" must be copied exactly from your rewrite, or be "" if the text was simply removed. Keep each "before" short: the phrase or sentence that changed, not a whole paragraph. "pattern" is the ID of the pattern the "before" text actually matches, judged by the tables above (hashtags are heading-style, not chatbot-residue); use "other" when the edit is a plain clarity or length cut that matches no pattern. "why" is under 15 words, in plain language.
- "kept": things that look like a pattern but you deliberately left alone, with a short reason. Empty list if none.

The source text arrives inside <source_text> tags. A rule-based scan of it is included as a hint; the scan can be wrong in both directions.`;

const PATTERN_IDS = [...Object.keys(PATTERNS), "other"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rewrite", "changes", "kept"],
  properties: {
    rewrite: { type: "string" },
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

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const HAS_KEY = { claude: !!process.env.ANTHROPIC_API_KEY, gemini: !!GOOGLE_KEY, openrouter: !!OPENROUTER_KEY };

function providerChain() {
  const listed = (process.env.PROVIDER || "claude,gemini,openrouter").toLowerCase().split(",").map((s) => s.trim());
  const chain = listed.filter((p) => HAS_KEY[p]);
  if (!chain.length) throw httpError(500, "No API key is set on the server. Add GOOGLE_API_KEY, OPENROUTER_API_KEY or ANTHROPIC_API_KEY.");
  return chain;
}

// Quota, overload and "model gone" errors mean another provider might still work.
function isRetryable(err) {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIError) return err.status >= 500;
  if (err instanceof GoogleApiError) return [404, 429, 500, 503].includes(err.status);
  return !!err.retryable;
}

// Each session keeps its own conversation so the repair pass can follow up on the first draft.

let anthropic;
function claudeSession() {
  if (!process.env.ANTHROPIC_API_KEY) throw httpError(500, "PROVIDER is claude but ANTHROPIC_API_KEY is not set.");
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
function geminiSession() {
  if (!GOOGLE_KEY) throw httpError(500, "PROVIDER is gemini but GOOGLE_API_KEY is not set.");
  google ??= new GoogleGenAI({ apiKey: GOOGLE_KEY });
  const contents = [];
  // Free-tier models often return 503 "high demand". Retry once, then try the fallback models.
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter((m) => m !== GEMINI_MODEL)];
  const session = {
    model: GEMINI_MODEL,
    async send(text) {
      contents.push({ role: "user", parts: [{ text }] });
      let res, lastErr;
      for (const [i, model] of [models[0], ...models].entries()) {
        try {
          res = await google.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: `${SKILL}\n\n${APP_INSTRUCTIONS}`,
              responseMimeType: "application/json",
              responseJsonSchema: SCHEMA,
              // Less thinking keeps a rewrite well under Vercel's time limit. MINIMAL, LOW, MEDIUM or HIGH.
              thinkingConfig: { thinkingLevel: GEMINI_THINKING },
            },
          });
          session.model = model;
          break;
        } catch (err) {
          lastErr = err;
          // 404: model retired for this key. 429: that model's free quota is used up (quotas are
          // per model). 500/503: overloaded. In each case, try the next model.
          if (!(err instanceof GoogleApiError) || ![404, 429, 500, 503].includes(err.status)) throw err;
          if (i === 0) await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!res) throw lastErr;
      const reason = res.candidates?.[0]?.finishReason;
      if (reason === "MAX_TOKENS") throw httpError(413, "The text is too long to rewrite in one go. Try a shorter piece.");
      if (!res.text) throw httpError(422, `The model returned no text${reason ? ` (${reason})` : ""}.`);
      contents.push({ role: "model", parts: [{ text: res.text }] });
      return JSON.parse(res.text);
    },
  };
  return session;
}

// OpenRouter speaks the OpenAI chat format. Free models: 20 requests a minute, and 50 a day
// (1,000 a day once the account has bought $10 of credit at any point).
function openrouterSession() {
  const messages = [{ role: "system", content: `${SKILL}\n\n${APP_INSTRUCTIONS}\n\nReply with a single JSON object that matches this JSON Schema:\n${JSON.stringify(SCHEMA)}` }];
  const session = {
    model: OPENROUTER_MODELS[0],
    async send(text) {
      messages.push({ role: "user", content: text });
      let lastErr;
      for (const model of OPENROUTER_MODELS) {
        // Ask for strict JSON Schema first; fall back to plain JSON mode for models without it.
        for (const response_format of [
          { type: "json_schema", json_schema: { name: "rewrite", strict: true, schema: SCHEMA } },
          { type: "json_object" },
        ]) {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENROUTER_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://declaude-nine.vercel.app",
              "X-Title": "deClaude",
            },
            body: JSON.stringify({ model, messages, response_format }),
          });
          const body = await r.json().catch(() => ({}));
          if (r.ok && body.choices?.[0]?.message?.content) {
            const content = body.choices[0].message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
            messages.push({ role: "assistant", content });
            session.model = model;
            return JSON.parse(content);
          }
          const msg = body.error?.message || `HTTP ${r.status}`;
          console.error("OpenRouter error", model, r.status, msg);
          lastErr = Object.assign(httpError(r.ok ? 502 : r.status, `OpenRouter: ${msg}`), {
            retryable: !r.ok && [404, 408, 429, 500, 502, 503].includes(r.status),
            daily: /per[- ]day/i.test(msg),
          });
          if (r.status === 401 || r.status === 402) throw lastErr; // bad key or no credit: stop
          if (r.status !== 400) break; // only a 400 is worth retrying in plain JSON mode
        }
      }
      throw lastErr;
    },
  };
  return session;
}

// Best-effort limiter. It resets whenever Vercel starts a fresh instance; the provider's
// spend limit or free-tier quota is the real backstop.
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

// Replace any dash that survived both passes. The brief requires zero em dashes.
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
      .filter((c) => c && typeof c.before === "string")
      .map((c) => ({ pattern: PATTERN_IDS.includes(c.pattern) ? c.pattern : "other", before: c.before, after: str(c.after), why: str(c.why) })),
    kept: (Array.isArray(data?.kept) ? data.kept : []).filter((k) => k && typeof k.text === "string").map((k) => ({ text: k.text, why: str(k.why) })),
  };
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

  const before = score(text);
  const started = Date.now();

  let lastErr;
  let chain;
  try {
    chain = providerChain();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  const tried = [];
  for (const provider of chain) {
    try {
      const session = { claude: claudeSession, gemini: geminiSession, openrouter: openrouterSession }[provider]();
      const result = await rewriteWith(session, text, before);
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
      if (!isRetryable(err)) break;
      console.error(`${provider} unavailable, trying the next provider:`, err.status, err.message);
    }
  }
  return sendError(res, lastErr);
}

async function rewriteWith(session, text, before) {
  let data = clean(await session.send(
    `<source_text>\n${text}\n</source_text>\n\nRule-based scan of the source:\n${hintList(before.findings)}`,
  ));
  if (!data.rewrite) throw httpError(502, "The AI returned an empty rewrite. Try again.");

  // One repair pass if hard patterns survived or facts/register were lost.
  let repaired = false;
  const leftover = detect(data.rewrite).filter((f) => MUST_FIX.has(f.id));
  const lost = preservationIssues(text, data.rewrite);
  if (leftover.length || lost.length) {
    repaired = true;
    const problems = [
      leftover.length ? `Your rewrite still contains these patterns:\n${hintList(leftover)}` : "",
      lost.length ? `Your rewrite breaks the hard rules on facts and register:\n${lost.map((l) => `- ${l}`).join("\n")}\nAlso recheck that every list item, action and stated lesson from the source survived.` : "",
    ].filter(Boolean).join("\n\n");
    const fixed = clean(await session.send(
      `${problems}\n\nFix only these, following the hard rules. Return the same JSON: the full updated rewrite, the full changes list measured against the original source text, and kept.`,
    ));
    if (fixed.rewrite) data = fixed;
  }

  let autoFixedDashes = false;
  if (/—|(?<!\d)–(?!\d)|\s--\s/.test(data.rewrite)) {
    data.rewrite = stripDashes(data.rewrite);
    autoFixedDashes = true;
  }

  return { ...data, before, after: score(data.rewrite), repaired, autoFixedDashes };
}

function sendError(res, err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(500).json({ error: "The server's Anthropic API key is missing or invalid." });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: "The AI service is busy. Wait a minute and try again." });
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error", err.status, err.message);
    return res.status(502).json({ error: `The AI service returned an error (${err.status}).` });
  }
  if (err instanceof GoogleApiError) {
    console.error("Gemini API error", err.status, err.message);
    if (err.status === 429) {
      const daily = /PerDay/i.test(err.message);
      return res.status(429).json({
        daily,
        error: daily
          ? "Today's free Gemini quota is used up on every model we can try. It resets at midnight US Pacific time."
          : "Too many rewrites in the last minute on the free Gemini tier. Wait a minute and try again.",
      });
    }
    if (err.status === 503 || err.status === 500) return res.status(503).json({ error: "Gemini's free models are overloaded right now. Try again in a minute." });
    if (err.status === 400 || err.status === 403) return res.status(500).json({ error: `Gemini rejected the request (${err.status}). Check GOOGLE_API_KEY and GEMINI_MODEL.` });
    return res.status(502).json({ error: `The AI service returned an error (${err.status}).` });
  }
  if (err?.message?.startsWith("OpenRouter:")) {
    if (err.status === 429) {
      return res.status(429).json({
        daily: err.daily,
        error: err.daily
          ? "Today's free AI quota is used up on every provider we can try. Try again tomorrow."
          : "Too many rewrites in the last minute on the free tier. Wait a minute and try again.",
      });
    }
    if (err.status === 401) return res.status(500).json({ error: "The server's OpenRouter API key is missing or invalid." });
    return res.status(502).json({ error: err.message });
  }
  if (err instanceof SyntaxError) {
    return res.status(502).json({ error: "The AI reply wasn't valid JSON. Try again." });
  }
  console.error(err);
  return res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
}
