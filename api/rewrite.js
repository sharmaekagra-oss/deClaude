// POST /api/rewrite  { text }  ->  { rewrite, changes, kept, before, after, ... }
// Vercel serverless function. The Anthropic key lives only in Vercel environment variables.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detect, score, PATTERNS } from "../app/detectors.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CLAUDE_EFFORT || "medium";
const MAX_CHARS = 12000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 30);

// Patterns that must not survive a rewrite. The weaker ones are left to judgment.
const MUST_FIX = new Set([
  "em-dash", "ai-vocab", "promo-language", "hedge-stack", "not-x-but-y", "stock-openers",
  "template-phrases", "ing-tail", "self-answer", "significance-inflation", "vague-attribution",
  "chatbot-residue", "generic-closer", "punchy-closer", "bold-labels", "heading-style",
]);

// Created on first use so a missing key gives a clear error instead of a crashed function.
let client;

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

// Best-effort limiter. It resets whenever Vercel starts a fresh instance; the Anthropic
// Console spend limit is the real backstop.
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

async function callClaude(messages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error("ANTHROPIC_API_KEY is not set on the server.");
    err.status = 500;
    throw err;
  }
  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
    system: [
      { type: "text", text: SKILL, cache_control: { type: "ephemeral" } },
      { type: "text", text: APP_INSTRUCTIONS },
    ],
    messages,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    const err = new Error("The model declined to rewrite this text.");
    err.status = 422;
    throw err;
  }
  if (msg.stop_reason === "max_tokens") {
    const err = new Error("The text is too long to rewrite in one go. Try a shorter piece.");
    err.status = 413;
    throw err;
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { msg, data: JSON.parse(text) };
}

// Replace any dash that survived both passes. The brief requires zero em dashes.
function stripDashes(text) {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/(?<!\d)\s*–\s*(?!\d)/g, ", ")
    .replace(/\s--\s/g, ", ")
    .replace(/,\s*([.,;:!?])/g, "$1");
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
    const messages = [{
      role: "user",
      content: `<source_text>\n${text}\n</source_text>\n\nRule-based scan of the source:\n${hintList(before.findings)}`,
    }];
    let { msg, data } = await callClaude(messages);

    // One repair pass if hard patterns survived.
    let repaired = false;
    const leftover = detect(data.rewrite).filter((f) => MUST_FIX.has(f.id));
    if (leftover.length) {
      repaired = true;
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: `Your rewrite still contains these patterns:\n${hintList(leftover)}\n\nFix only these, following the hard rules. Return the same JSON: the full updated rewrite, the full changes list measured against the original source text, and kept.`,
      });
      ({ data } = await callClaude(messages));
    }

    let autoFixedDashes = false;
    if (/—|(?<!\d)–(?!\d)|\s--\s/.test(data.rewrite)) {
      data.rewrite = stripDashes(data.rewrite);
      autoFixedDashes = true;
    }

    return res.status(200).json({
      rewrite: data.rewrite,
      changes: data.changes,
      kept: data.kept,
      before,
      after: score(data.rewrite),
      repaired,
      autoFixedDashes,
      model: MODEL,
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
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: "The AI reply wasn't valid JSON. Try again." });
    }
    console.error(err);
    return res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
  }
}
