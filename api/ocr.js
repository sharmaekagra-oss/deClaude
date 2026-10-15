// POST /api/ocr  { images: [dataURL, ...], slides }  ->  { pages: [{ text, struck }], model, provider, seconds }
// "Read with AI": a vision model transcribes page images word for word, in reading order, and
// reports crossed-out text. Only runs when the user clicks the button, because it uses free quota.
//
//   gemini      needs GOOGLE_API_KEY      (models: OCR_GEMINI_MODELS)
//   openrouter  needs OPENROUTER_API_KEY  (models: OCR_OPENROUTER_MODELS, free vision models)
// OCR_PROVIDER is an ordered list, default "gemini,openrouter". Groq has no vision model on the free tier.
import { GoogleGenAI, ApiError as GoogleApiError } from "@google/genai";

const list = (v, d) => (v || d).split(",").map((s) => s.trim()).filter(Boolean);
const GOOGLE_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
// Checked against each provider's model list on 2026-10-15. Flash-lite has its own daily quota.
const GEMINI_MODELS = list(process.env.OCR_GEMINI_MODELS, "gemini-3.8-flash,gemini-flash-latest,gemini-3.5-flash,gemini-3.5-flash-lite");
const OPENROUTER_MODELS = list(process.env.OCR_OPENROUTER_MODELS, "google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free");
const MAX_IMAGES = 10;
const MAX_BYTES = 4_000_000; // Vercel rejects request bodies over 4.5 MB
// A healthy model reads 10 slides in about 20 s; an overloaded one can hang, so move on sooner.
const CALL_TIMEOUT = Number(process.env.OCR_CALL_TIMEOUT_MS || 75_000);
const REQUEST_BUDGET = Number(process.env.REQUEST_BUDGET_MS || 200_000);
const RATE_LIMIT = Number(process.env.OCR_RATE_LIMIT_PER_HOUR || 10);

const PROMPT = `You transcribe text from page images for an app that edits wording. Return JSON with one entry in "pages" per image, in the order given.

- "text": every word of real content on the page, exactly as written: same spelling, capitals, punctuation, numbers and symbols. Keep hyphens, em dashes (—) and ellipses (…) exactly as printed; "tidying" them is an error. Never correct, reword, shorten, summarise or translate. If a word can't be read, write [?].
- Reading order: top to bottom, left to right, finishing a column or box before the next one. One line per heading, label or bullet. Join a sentence that wraps across lines back into one line. Put a blank line between separate blocks.
- Leave out decoration: page numbers such as "3 / 10", a header or footer that repeats on every page, huge faint background numbers, logos, QR codes, and scrolling ticker strips cut off at the page edge. Keep chart labels and values only where they carry information.
- "struck": every passage shown crossed out (a line drawn through the text), copied exactly as it appears in "text". Empty list if there are none.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "struck"],
        properties: { text: { type: "string" }, struck: { type: "array", items: { type: "string" } } },
      },
    },
  },
};

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status }, extra);
const RETRY_STATUS = [404, 408, 413, 429, 500, 502, 503, 504];
const isTimeout = (err) => err?.name === "TimeoutError" || err?.name === "AbortError";

// Models that just failed for quota or overload are skipped for a while (per warm instance).
const coolUntil = new Map();
const cooling = (key) => (coolUntil.get(key) || 0) > Date.now();
function coolDown(key, status, message = "") {
  const hinted = message.match(/(?:retryDelay"?:\s*"?|retry in |try again in )(\d+(?:\.\d+)?)\s*s/i);
  const secs = status === 404 ? 6 * 3600 : status === 429 ? (hinted ? Number(hinted[1]) : /per[- ]?day/i.test(message) ? 3600 : 60) : 30;
  coolUntil.set(key, Date.now() + Math.min(secs, 24 * 3600) * 1000);
}

function callSignal(deadline) {
  const left = Math.min(CALL_TIMEOUT, deadline - Date.now());
  if (left < 10_000) throw httpError(503, "Ran out of time trying free models.", { retryable: true, outOfTime: true });
  return AbortSignal.timeout(left);
}

let google;
async function withGemini(images, prompt, deadline) {
  google ??= new GoogleGenAI({ apiKey: GOOGLE_KEY });
  let lastErr;
  for (const model of GEMINI_MODELS) {
    if (cooling(`gemini:${model}`)) continue;
    try {
      const res = await google.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }))] }],
        config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, abortSignal: callSignal(deadline) },
      });
      if (!res.text) throw httpError(502, "The AI reader returned nothing.", { retryable: true });
      return { data: JSON.parse(res.text), model };
    } catch (err) {
      lastErr = err;
      if (err.outOfTime) throw err;
      if (isTimeout(err) || err.retryable || err instanceof SyntaxError) {
        console.error("Gemini OCR failed", model, isTimeout(err) ? "timed out" : err.message);
        coolDown(`gemini:${model}`, 503);
        continue;
      }
      if (!(err instanceof GoogleApiError) || !RETRY_STATUS.includes(err.status)) throw err;
      console.error("Gemini OCR unavailable", model, err.status, String(err.message).slice(0, 160));
      coolDown(`gemini:${model}`, err.status, err.message);
      lastErr = Object.assign(err, { retryable: true, daily: /per[- ]?day/i.test(err.message) });
    }
  }
  throw lastErr || httpError(503, "All Gemini models are cooling down.", { retryable: true });
}

async function withOpenRouter(images, prompt, deadline) {
  let lastErr;
  for (const model of OPENROUTER_MODELS) {
    if (cooling(`openrouter:${model}`)) continue;
    let r;
    try {
      r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        signal: callSignal(deadline),
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://declaude-nine.vercel.app",
          "X-Title": "deClaude",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          response_format: { type: "json_object" },
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `${prompt}\n\nReply with a single JSON object that matches this JSON Schema:\n${JSON.stringify(SCHEMA)}` },
              ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } })),
            ],
          }],
        }),
      });
    } catch (err) {
      if (err.outOfTime) throw err;
      lastErr = httpError(504, "OpenRouter timed out", { retryable: true });
      coolDown(`openrouter:${model}`, 503);
      continue;
    }
    const body = await r.json().catch(() => ({}));
    const content = body.choices?.[0]?.message?.content;
    if (r.ok && content && body.choices[0].finish_reason !== "length") {
      try {
        return { data: JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")), model };
      } catch {
        lastErr = httpError(502, "OpenRouter reply wasn't valid JSON", { retryable: true });
        continue;
      }
    }
    const msg = body.error?.message || `HTTP ${r.status}`;
    console.error("OpenRouter OCR error", model, r.status, msg);
    lastErr = httpError(r.ok ? 502 : r.status, `OpenRouter: ${msg}`, { retryable: r.ok || RETRY_STATUS.includes(r.status), daily: /per[- ]?day/i.test(msg) });
    if ([401, 402, 403].includes(r.status)) throw lastErr;
    coolDown(`openrouter:${model}`, r.status, msg);
  }
  throw lastErr || httpError(503, "All OpenRouter vision models are cooling down.", { retryable: true });
}

const PROVIDERS = {
  gemini: { has: () => !!GOOGLE_KEY, run: withGemini },
  openrouter: { has: () => !!process.env.OPENROUTER_API_KEY, run: withOpenRouter },
};

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

// Only JPEG, PNG or WebP data URLs; returns [{ mime, data }] or throws a 400.
function parseImages(raw) {
  if (!Array.isArray(raw) || !raw.length) throw httpError(400, "No pages were sent.");
  if (raw.length > MAX_IMAGES) throw httpError(400, `Send at most ${MAX_IMAGES} pages at a time.`);
  if (raw.reduce((n, s) => n + (typeof s === "string" ? s.length : 0), 0) > MAX_BYTES) throw httpError(413, "Those pages are too large to send. Try fewer pages.");
  return raw.map((s) => {
    const m = typeof s === "string" && s.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw httpError(400, "Pages must be JPEG, PNG or WebP images.");
    return { mime: m[1], data: m[2] };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const passcode = process.env.APP_PASSCODE;
  if (passcode && req.headers["x-passcode"] !== passcode) {
    return res.status(401).json({ error: "Enter the class passcode first.", needsPasscode: true });
  }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many AI reads this hour. Use the normal attach, or try later." });

  let images;
  try {
    images = parseImages(req.body?.images);
  } catch (err) {
    return res.status(err.status).json({ error: err.message });
  }
  const prompt = req.body?.slides ? `${PROMPT}\n\nThese are slides from a presentation, one image per slide.` : PROMPT;

  const chain = list(process.env.OCR_PROVIDER, "gemini,openrouter").filter((p) => PROVIDERS[p]?.has());
  if (!chain.length) return res.status(500).json({ error: "No vision model is set up on the server (needs GOOGLE_API_KEY or OPENROUTER_API_KEY)." });

  const started = Date.now();
  const deadline = started + REQUEST_BUDGET;
  let lastErr;
  for (const provider of chain) {
    try {
      const { data, model } = await PROVIDERS[provider].run(images, prompt, deadline);
      const pages = (Array.isArray(data?.pages) ? data.pages : []).slice(0, images.length).map((p) => {
        const text = typeof p?.text === "string" ? p.text.replace(/\r\n/g, "\n") : "";
        // Only crossed-out passages that really appear in the transcription.
        const struck = (Array.isArray(p?.struck) ? p.struck : []).filter((s) => typeof s === "string" && s.trim() && text.includes(s.trim())).map((s) => s.trim());
        return { text, struck };
      });
      return res.status(200).json({ pages, provider, model, seconds: Math.round((Date.now() - started) / 1000) });
    } catch (err) {
      lastErr = err;
      if (!err.retryable || err.outOfTime) break;
      console.error(`${provider} OCR unavailable, trying the next provider:`, err.status, err.message);
    }
  }
  console.error("OCR failed", lastErr?.status, lastErr?.message);
  if (lastErr?.retryable) {
    return res.status(503).json({
      error: lastErr.daily
        ? "Today's free AI reading quota is used up. Use the normal attach, or try again tomorrow."
        : "The free AI readers are busy right now. Wait a minute and try again, or use the normal attach.",
    });
  }
  return res.status(502).json({ error: "The AI reader had a problem. Try again, or use the normal attach." });
}
