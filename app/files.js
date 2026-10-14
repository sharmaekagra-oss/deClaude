// Reading attached files and downloading the rewrite. Everything happens in the browser:
// the file itself is never uploaded, only the extracted text is sent for rewriting.
// Libraries load from the CDN the first time they're needed.

const LIBS = {
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs",
  pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs",
  docx: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js",
};
export const ACCEPT = ".txt,.md,.markdown,.docx,.pdf";
const MAX_BYTES = 10 * 1024 * 1024;

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

async function readPdf(buffer, notes) {
  const pdfjs = await import(LIBS.pdfjs);
  pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: buffer }).promise;
  } catch (e) {
    if (e?.name === "PasswordException") throw new Error("That PDF is password-protected. Remove the password (or copy the text out) and try again.");
    throw new Error("That PDF couldn't be opened. It may be damaged. Try exporting it again, or paste the text.");
  }
  const pages = [];
  const empty = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let page = "";
    for (const item of content.items) page += item.str + (item.hasEOL ? "\n" : "");
    if (!page.trim()) empty.push(n);
    pages.push(page);
  }
  if (empty.length && empty.length < doc.numPages) {
    notes.push(`Page${empty.length > 1 ? "s" : ""} ${empty.join(", ")} had no text, probably scanned images. Their content is missing.`);
  }
  // PDFs break lines inside paragraphs; join those lines back up, keep blank-line breaks.
  const text = pages.join("\n\n").replace(/([^\n])\n(?!\n)/g, "$1 ");
  const words = (text.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length;
  if (words > 120 && !/\n\n/.test(text.trim())) {
    notes.push("PDFs don't store paragraphs, so the text came through as one block. Add paragraph breaks if they matter.");
  } else {
    notes.push("Text from PDFs can come through with odd line breaks or merged paragraphs. Check it before rewriting.");
  }
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

// Returns { text, name, notes }. notes are limitations worth telling the user about.
// Throws an Error with a message that's safe to show the user.
export async function readFile(file) {
  if (file.size > MAX_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB; the limit is 10 MB. Try a smaller file, or paste the text.`);
  if (file.size === 0) throw new Error("That file is empty.");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const notes = [];
  let text;
  if (["txt", "md", "markdown"].includes(ext)) {
    text = await file.text();
    if (text.includes("�")) notes.push("Some characters couldn't be read. The file may not be saved as UTF-8; check for odd symbols.");
    if (["md", "markdown"].includes(ext)) notes.push("Markdown symbols (#, **, -) are treated as part of the text. Bold labels count as an AI tell and will be removed.");
  } else if (ext === "docx") {
    text = await readDocx(await file.arrayBuffer(), notes);
  } else if (ext === "pdf") {
    text = await readPdf(await file.arrayBuffer(), notes);
  } else if (ext === "doc") {
    throw new Error("Old .doc files aren't supported. Open it in Word, save it as .docx, and attach that.");
  } else if (["pages", "odt", "rtf"].includes(ext)) {
    throw new Error(`.${ext} files aren't supported. Export it as .docx or .pdf, or paste the text.`);
  } else if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) {
    throw new Error("That's an image. deClaude only reads text; it can't read text inside pictures.");
  } else {
    throw new Error("Attach a .docx, .pdf, .txt or .md file.");
  }
  text = tidy(text || "");
  if (!text) {
    throw new Error(ext === "pdf"
      ? "No text found in that PDF. It's probably a scanned image, which needs OCR (text recognition) first."
      : "That file has no text in it.");
  }
  // Safe for a download file name on any OS: no path or reserved characters, not too long.
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/^[-.\s]+|[-.\s]+$/g, "").slice(0, 60) || "document";
  return { text, name, notes };
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
