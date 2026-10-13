// POST /api/rewrite  { text }  ->  { rewrite, changes, kept, before, after, ... }
// Vercel serverless function. API keys live only in environment variables.
//
// Two providers, same SKILL.md and same JSON output:
//   claude  needs ANTHROPIC_API_KEY  (model: CLAUDE_MODEL, default claude-opus-5-5)
//   gemini  needs GOOGLE_API_KEY     (model: GEMINI_MODEL, default gemini-3.8-flash; free tier)
// PROVIDER picks one. If unset, Claude is used when its key is present, otherwise Gemini.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ApiError as GoogleApiError } from "@google/genai";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detect, score, PATTERNS } from "../app/detectors.js";

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "medium";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const GEMINI_FALLBACKS = (process.env.GEMINI_FALLBACKS || "gemini-flash-latest,gemini-3.5-flash,gemini-flash-lite-latest").split(",").map((s) => s.trim()).filter(Boolean);
const GOOGLE_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
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
- "changes": one entry per edit, in the order they appear in the source. "before" must be copied exactly, character for character, from the source text so the app can highlight it. "after" must be copied exactly from your rewrite, or be "" if the text was simply removed. Keep each "before" short: the phrase or sentence that changed, not a whole paragraph. "pattern" is the pattern ID you fixed, or "other" for a plain clarity edit. "why" is under 15 words, in plain language.
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

function pickProvider() {
  const wanted = (process.env.PROVIDER || "").toLowerCase();
  if (wanted === "claude" || wanted === "gemini") return wanted;
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (GOOGLE_KEY) return "gemini";
  throw httpError(500, "No API key is set on the server. Add ANTHROPIC_API_KEY or GOOGLE_API_KEY.");
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
            },
          });
          session.model = model;
          break;
        } catch (err) {
          lastErr = err;
          // 404: model retired for this key; 500/503: overloaded. Either way, try the next one.
          if (!(err instanceof GoogleApiError) || ![404, 500, 503].includes(err.status)) throw err;
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

  try {
    const provider = pickProvider();
    const session = provider === "gemini" ? geminiSession() : claudeSession();

    let data = clean(await session.send(
      `<source_text>\n${text}\n</source_text>\n\nRule-based scan of the source:\n${hintList(before.findings)}`,
    ));
    if (!data.rewrite) throw httpError(502, "The AI returned an empty rewrite. Try again.");

    // One repair pass if hard patterns survived.
    let repaired = false;
    const leftover = detect(data.rewrite).filter((f) => MUST_FIX.has(f.id));
    if (leftover.length) {
      repaired = true;
      const fixed = clean(await session.send(
        `Your rewrite still contains these patterns:\n${hintList(leftover)}\n\nFix only these, following the hard rules. Return the same JSON: the full updated rewrite, the full changes list measured against the original source text, and kept.`,
      ));
      if (fixed.rewrite) data = fixed;
    }

    let autoFixedDashes = false;
    if (/—|(?<!\d)–(?!\d)|\s--\s/.test(data.rewrite)) {
      data.rewrite = stripDashes(data.rewrite);
      autoFixedDashes = true;
    }

    return res.status(200).json({
      ...data,
      before,
      after: score(data.rewrite),
      repaired,
      autoFixedDashes,
      provider,
      model: session.model,
      seconds: Math.round((Date.now() - started) / 1000),
    });
  } catch (err) {
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
      if (err.status === 429) return res.status(429).json({ error: "The free Gemini quota is used up for now. Wait a minute, or try again tomorrow." });
      if (err.status === 503 || err.status === 500) return res.status(503).json({ error: "Gemini's free models are overloaded right now. Try again in a minute." });
      if (err.status === 400 || err.status === 403) return res.status(500).json({ error: `Gemini rejected the request (${err.status}). Check GOOGLE_API_KEY and GEMINI_MODEL.` });
      return res.status(502).json({ error: `The AI service returned an error (${err.status}).` });
    }
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: "The AI reply wasn't valid JSON. Try again." });
    }
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
  }
}
