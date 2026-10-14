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

async function readPdf(buffer) {
  const pdfjs = await import(LIBS.pdfjs);
  pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let page = "";
    for (const item of content.items) page += item.str + (item.hasEOL ? "\n" : "");
    pages.push(page);
  }
  // PDFs break lines inside paragraphs; join those lines back up, keep blank-line breaks.
  return pages.join("\n\n").replace(/([^\n])\n(?!\n)/g, "$1 ");
}

// Returns { text, name }. Throws an Error with a message that's safe to show the user.
export async function readFile(file) {
  if (file.size > MAX_BYTES) throw new Error("That file is over 10 MB. Try a smaller one, or paste the text.");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let text;
  if (["txt", "md", "markdown"].includes(ext)) {
    text = await file.text();
  } else if (ext === "docx") {
    const mammoth = await loadScript(LIBS.mammoth, "mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (ext === "pdf") {
    text = await readPdf(await file.arrayBuffer());
  } else if (ext === "doc") {
    throw new Error("Old .doc files aren't supported. Save it as .docx in Word and attach that.");
  } else {
    throw new Error("Attach a .txt, .md, .docx or .pdf file.");
  }
  text = tidy(text || "");
  if (!text) {
    throw new Error(ext === "pdf"
      ? "No text found in that PDF. It may be a scanned image, which needs OCR first."
      : "That file has no text in it.");
  }
  return { text, name: file.name.replace(/\.[^.]+$/, "") };
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
