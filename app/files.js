// Reading attached files and downloading the rewrite. Text is read in the browser, in layers:
//   1. the file's own text (PDF text layer, .docx, .txt), exact and free;
//   2. text recognition (Tesseract) for images and PDF pages without text, still in the browser;
//   3. "Read with AI" (readWithAI), which sends page images to /api/ocr only when the user asks.
// Libraries load from the CDN the first time they're needed.
import { pageLines, dropFurniture, looksLikeSlides } from "./pdf-layout.js";

const LIBS = {
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs",
  pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs",
  docx: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
};
const IMAGES = ["png", "jpg", "jpeg", "webp"];
export const ACCEPT = `.txt,.md,.markdown,.docx,.pdf,${IMAGES.map((e) => `.${e}`).join(",")}`;
const MAX_BYTES = 10 * 1024 * 1024;
const OCR_MAX_PAGES = 20; // in-browser text recognition, a few seconds a page
const AI_MAX_PAGES = 10; // "Read with AI": one request, within the free tier and Vercel's 4.5 MB body limit
const marker = (n) => `--- Slide ${n} ---`;

const scripts = {};
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  scripts[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error(`${globalName} failed to load`)));
    s.onerror = () => reject(new Error("Couldn't load the file reader. Check your connection and try again."));
    document.head.append(s);
  });
  return scripts[src];
}

const tidy = (t) => t.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const countWords = (t) => (t.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
const pageList = (ns) => `Page${ns.length > 1 ? "s" : ""} ${ns.join(", ")}`;

async function openPdf(buffer) {
  const pdfjs = await import(LIBS.pdfjs);
  pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  try {
    return await pdfjs.getDocument({ data: buffer }).promise;
  } catch (e) {
    if (e?.name === "PasswordException") throw new Error("That PDF is password-protected. Remove the password (or copy the text out) and try again.");
    throw new Error("That PDF couldn't be opened. It may be damaged. Try exporting it again, or paste the text.");
  }
}

// A PDF page drawn on a white canvas, longest side `side` pixels.
async function renderPage(page, side) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: side / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // "print" renders without animation frames, which browsers pause in background tabs.
  await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
  return canvas;
}

// Tesseract in the browser. One worker, created on first use (it downloads about 4 MB once).
let ocrWorker = null;
let ocrProgress = () => {};
async function recognise(image, onProgress) {
  const Tesseract = await loadScript(LIBS.tesseract, "Tesseract");
  ocrProgress = onProgress || (() => {});
  ocrWorker ??= Tesseract.createWorker("eng", 1, {
    logger: (m) => { if (m.status === "recognizing text") ocrProgress(m.progress); },
  }).catch((e) => { ocrWorker = null; throw e; });
  let data;
  try {
    ({ data } = await (await ocrWorker).recognize(image));
  } catch {
    throw new Error("Text recognition couldn't run in this browser. Try Read with AI, or paste the text.");
  }
  // Lines Tesseract is unsure of are mostly noise from pictures and logos.
  return (data.lines || []).filter((l) => l.confidence >= 45).map((l) => l.text.trim()).filter(Boolean).join("\n");
}

async function readPdf(buffer, notes, onProgress) {
  const doc = await openPdf(buffer);
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    let raw = "";
    for (const item of items) raw += item.str + (item.hasEOL ? "\n" : "");
    const lines = pageLines(items, width, height);
    pages.push({ n, page, raw, lines, width, height, words: countWords(raw) });
  }

  // Pages with no text layer are scans or pictures: recognise them in the browser.
  const empty = pages.filter((p) => !p.raw.trim());
  const ocrd = [], skipped = [], blank = [];
  for (const [i, p] of empty.entries()) {
    if (i >= OCR_MAX_PAGES) { skipped.push(p.n); continue; }
    onProgress?.(`Reading page ${p.n} with text recognition (${i + 1} of ${Math.min(empty.length, OCR_MAX_PAGES)})…`);
    p.ocr = await recognise(await renderPage(p.page, 2400), (f) => onProgress?.(`Reading page ${p.n} with text recognition… ${Math.round(f * 100)}%`));
    (p.ocr ? ocrd : blank).push(p.n);
    p.words = countWords(p.ocr);
  }
  if (ocrd.length) notes.push(`${pageList(ocrd)} had no text layer, so ${ocrd.length > 1 ? "they were" : "it was"} read with text recognition. Check for misread words.`);
  if (blank.length) notes.push(`${pageList(blank)} had no readable text, even with text recognition.`);
  if (skipped.length) notes.push(`${pageList(skipped)} were skipped: text recognition stops after ${OCR_MAX_PAGES} pages.`);

  const slides = looksLikeSlides(pages);
  let text;
  if (slides) {
    // Slides keep their lines and get one marker each, so the rewrite keeps every point on its slide.
    const cleaned = dropFurniture(pages);
    text = pages.map((p, i) => `${marker(i + 1)}\n${p.ocr ?? cleaned[i]}`).join("\n\n");
    notes.push(`This looks like a slide deck (${pages.length} slides), so each slide is kept separate under a "${marker(1)}" line. Leave those lines in; the rewrite keeps each slide's text on its slide.`);
    notes.push("Charts and screenshots inside slides come through as loose words. Delete them before rewriting, or try Read with AI.");
  } else {
    // PDFs break lines inside paragraphs; join those lines back up, keep blank-line breaks.
    text = pages.map((p) => p.ocr ?? p.raw).join("\n\n").replace(/([^\n])\n(?!\n)/g, "$1 ");
    if (countWords(text) > 120 && !/\n\n/.test(text.trim())) {
      notes.push("PDFs don't store paragraphs, so the text came through as one block. Add paragraph breaks if they matter.");
    } else {
      notes.push("Text from PDFs can come through with odd line breaks or merged paragraphs. Check it before rewriting.");
    }
  }
  return { text, slides };
}

async function readImage(file, notes, onProgress) {
  onProgress?.("Reading the image with text recognition…");
  const text = await recognise(file, (f) => onProgress?.(`Reading the image with text recognition… ${Math.round(f * 100)}%`));
  if (!text) throw new Error("No readable text found in that image. Try Read with AI, or paste the text.");
  notes.push("Read from the image with text recognition. Check for misread words, especially in headings, logos and text over pictures.");
  return text;
}

async function readDocx(buffer, notes) {
  const mammoth = await loadScript(LIBS.mammoth, "mammoth");
  let raw, html;
  try {
    [raw, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }),
      mammoth.convertToHtml({ arrayBuffer: buffer.slice(0) }),
    ]);
  } catch {
    throw new Error("That Word file couldn't be read. It may be damaged or not a real .docx. Try saving it again from Word.");
  }
  // Tell the user what won't survive: the rewrite comes back as plain paragraphs.
  const h = html.value;
  const lost = [];
  if (/<h[1-6][\s>]/.test(h)) lost.push("headings");
  if (/<(strong|em|u)[\s>]/.test(h)) lost.push("bold or italic text");
  if (/<(ul|ol)[\s>]/.test(h)) lost.push("bullet or numbered lists");
  if (/<table[\s>]/.test(h)) lost.push("tables");
  if (/<a\s/.test(h)) lost.push("links");
  if (lost.length) notes.push(`This document has ${joinList(lost)}. The rewrite comes back as plain paragraphs, so that formatting won't be kept.`);
  if (/<img[\s>]/.test(h)) notes.push("Images in the document were skipped; only the text is rewritten.");
  if (/<table[\s>]/.test(h)) notes.push("Table cells came through as separate lines. Check they still read in the right order.");
  return raw.value;
}

const joinList = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

const extOf = (file) => (file.name.split(".").pop() || "").toLowerCase();

// Files that "Read with AI" can look at: PDFs and images.
export const canReadWithAI = (file) => !!file && (extOf(file) === "pdf" || IMAGES.includes(extOf(file)));

// Returns { text, name, notes, slides }. notes are limitations worth telling the user about.
// onProgress(message) reports slow steps (text recognition). Throws an Error safe to show the user.
export async function readFile(file, onProgress) {
  if (file.size > MAX_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB. Try a smaller file, or paste the text.`);
  if (file.size === 0) throw new Error("That file is empty.");
  const ext = extOf(file);
  const notes = [];
  let text;
  let slides = false;
  if (["txt", "md", "markdown"].includes(ext)) {
    text = await file.text();
    if (text.includes("�")) notes.push("Some characters couldn't be read. The file may not be saved as UTF-8; check for odd symbols.");
    if (["md", "markdown"].includes(ext)) notes.push("Markdown symbols (#, **, -) are treated as part of the text. Bold labels count as an AI tell and will be removed.");
  } else if (ext === "docx") {
    text = await readDocx(await file.arrayBuffer(), notes);
  } else if (ext === "pdf") {
    ({ text, slides } = await readPdf(await file.arrayBuffer(), notes, onProgress));
  } else if (IMAGES.includes(ext)) {
    text = await readImage(file, notes, onProgress);
  } else if (ext === "doc") {
    throw new Error("Old .doc files aren't supported. Open it in Word, save it as .docx, and attach that.");
  } else if (["pages", "odt", "rtf"].includes(ext)) {
    throw new Error(`.${ext} files aren't supported. Export it as .docx or .pdf, or paste the text.`);
  } else if (["gif", "heic", "heif", "tif", "tiff", "bmp"].includes(ext)) {
    throw new Error(`.${ext} images can't be read here. Save it as .jpg or .png and attach that.`);
  } else {
    throw new Error("Attach a .docx, .pdf, .txt, .md, .jpg or .png file.");
  }
  text = tidy(text || "");
  if (!text) {
    throw new Error(ext === "pdf"
      ? "No text found in that PDF, even with text recognition. Try Read with AI, or paste the text."
      : "That file has no text in it.");
  }
  return { text, name: safeName(file), notes, slides };
}

// Safe for a download file name on any OS: no path or reserved characters, not too long.
const safeName = (file) => file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/^[-.\s]+|[-.\s]+$/g, "").slice(0, 60) || "document";

// JPEGs small enough to send: shrink until all pages fit under the request limit.
async function pageImages(canvases) {
  for (const [side, quality] of [[1600, 0.75], [1280, 0.7], [1024, 0.65], [800, 0.6]]) {
    const urls = canvases.map((c) => {
      const scale = Math.min(1, side / Math.max(c.width, c.height));
      const out = document.createElement("canvas");
      out.width = Math.round(c.width * scale);
      out.height = Math.round(c.height * scale);
      out.getContext("2d").drawImage(c, 0, 0, out.width, out.height);
      return out.toDataURL("image/jpeg", quality);
    });
    if (urls.reduce((n, u) => n + u.length, 0) < 3_800_000) return urls;
  }
  throw new Error("Those pages are too large to send. Try fewer pages, or a smaller file.");
}

async function imageCanvas(file) {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That image couldn't be opened. Try saving it as .jpg or .png."); });
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0);
  return c;
}

// Vision models tidy as they read ("fast-paced" -> "fast paced", dropped em dashes). When the PDF
// has its own text, each line the AI returns is matched to it on letters and digits alone, and the
// file's exact characters are used instead. The AI then only decides reading order and strikes.
function snapper(layer) {
  let norm = "";
  const map = [];
  for (let i = 0; i < layer.length; i++) {
    if (/[\p{L}\p{N}]/u.test(layer[i])) { norm += layer[i].toLowerCase(); map.push(i); }
  }
  let cursor = 0; // lines arrive in reading order, so a repeated label matches its next occurrence
  return (s) => {
    const n = s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (n.length < 4) return null;
    let at = norm.indexOf(n, cursor);
    if (at < 0) {
      at = norm.indexOf(n);
      if (at < 0 || norm.indexOf(n, at + 1) >= 0) return null; // missing, or ambiguous out of order
    }
    cursor = at + n.length;
    let start = map[at], end = map[at + n.length - 1] + 1;
    // Take the punctuation that hugs the match in the file: quotes, full stops, em dashes.
    while (start > 0 && /[^\s\p{L}\p{N}]/u.test(layer[start - 1])) start--;
    while (end < layer.length && /[^\s\p{L}\p{N}]/u.test(layer[end])) end++;
    return layer.slice(start, end).replace(/[ \t]+/g, " ");
  };
}

// Layer 3: a vision model reads the pages, keeps reading order, skips decoration and reports
// crossed-out text, which becomes "keep as is" (a deck that strikes through "delve" is quoting it).
// Returns { text, keep, notes, slides, name }.
export async function readWithAI(file, passcode, onProgress) {
  const notes = [];
  let canvases = [], slides = false;
  const layers = []; // the PDF's own text, per page
  if (extOf(file) === "pdf") {
    const doc = await openPdf(await file.arrayBuffer());
    const count = Math.min(doc.numPages, AI_MAX_PAGES);
    const sizes = [];
    for (let n = 1; n <= count; n++) {
      onProgress?.(`Preparing page ${n} of ${count}…`);
      const page = await doc.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const { items } = await page.getTextContent();
      layers.push(pageLines(items, width, height).map((l) => l.text).join("\n"));
      sizes.push({ width, height, words: countWords(items.map((i) => i.str).join(" ")) });
      canvases.push(await renderPage(page, 1600));
    }
    slides = looksLikeSlides(sizes) || (doc.numPages > 1 && sizes.every((s) => s.width > s.height * 1.15));
    if (doc.numPages > AI_MAX_PAGES) notes.push(`Only the first ${AI_MAX_PAGES} of ${doc.numPages} pages were read: one AI read is capped at ${AI_MAX_PAGES} pages to stay inside the free tier.`);
  } else {
    canvases = [await imageCanvas(file)];
  }
  const images = await pageImages(canvases);
  onProgress?.(`Sending ${images.length} page${images.length > 1 ? "s" : ""} to the AI reader. This can take up to a minute…`);
  let res;
  try {
    res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-passcode": passcode || "" },
      body: JSON.stringify({ images, slides }),
    });
  } catch {
    throw new Error("Couldn't reach the deClaude server. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `The AI reader failed (error ${res.status}). Try again in a minute.`), { needsPasscode: data.needsPasscode });
  const pages = Array.isArray(data.pages) ? data.pages : [];
  let lines = 0, snapped = 0;
  const struck = [];
  const texts = pages.map((p, i) => {
    const snap = layers[i]?.trim() ? snapper(layers[i]) : null;
    const text = tidy(String(p?.text || "")).split("\n").map((line) => {
      // Lines too short to match ("0", "→") aren't counted either way.
      if (!snap || line.replace(/[^\p{L}\p{N}]/gu, "").length < 4) return line;
      lines++;
      const exact = snap(line);
      if (exact) snapped++;
      return exact ?? line;
    }).join("\n");
    for (const s of Array.isArray(p?.struck) ? p.struck : []) {
      const exact = snap?.(String(s));
      struck.push(exact && text.includes(exact) ? exact : String(s).trim());
    }
    return text;
  });
  if (!texts.some((t) => t.trim())) throw new Error("The AI reader found no text. Try the normal attach, or paste the text.");
  const text = slides
    ? texts.map((t, i) => `${marker(i + 1)}\n${t}`).join("\n\n")
    : texts.join("\n\n");
  const keep = [...new Set(struck)].filter((s) => s.length >= 2 && text.includes(s));
  notes.push(`Read by ${data.model || "an AI model"} in ${data.seconds ?? "?"}s.`);
  if (lines) {
    notes.push(snapped === lines
      ? "Every line was matched to the PDF's own text, so the wording and punctuation are exactly the file's."
      : `${snapped} of ${lines} lines were matched to the PDF's own text and use its exact wording. The other ${lines - snapped} come from the AI alone, which can misread or tidy punctuation: check those.`);
  } else {
    notes.push("AI readers can misread words or tidy punctuation. Check the text against the file before rewriting.");
  }
  if (keep.length) notes.push(`${keep.length} crossed-out passage${keep.length > 1 ? "s were" : " was"} added to "Keep as is", so ${keep.length > 1 ? "they aren't" : "it isn't"} counted or rewritten. Remove any that aren't really crossed out.`);
  return { text, keep, notes, slides, name: safeName(file) };
}

function save(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadTxt(text, base) {
  save(new Blob([text], { type: "text/plain;charset=utf-8" }), `${base}-declauded.txt`);
}

// A clean Word document: one paragraph per block, line breaks kept inside a block.
export async function downloadDocx(text, base) {
  const docx = await loadScript(LIBS.docx, "docx");
  const { Document, Packer, Paragraph, TextRun } = docx;
  const paragraphs = text.split(/\n{2,}/).map((block) => new Paragraph({
    spacing: { after: 200 },
    children: block.split("\n").map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 })),
  }));
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: paragraphs }],
  });
  save(await Packer.toBlob(doc), `${base}-declauded.docx`);
}
