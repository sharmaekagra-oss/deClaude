import { detect, score, PATTERNS, FAMILIES } from "./detectors.js";
import { ACCEPT, readFile, downloadTxt, downloadDocx } from "./files.js";

const $ = (id) => document.getElementById(id);
const src = $("src"), live = $("live"), go = $("go"), pass = $("pass"), err = $("err");
let result = null;
let mode = "changes";

const famOf = (id) => (PATTERNS[id] ? PATTERNS[id].family : "Other");
const labelOf = (id) => (PATTERNS[id] ? PATTERNS[id].label : "Clarity edit");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

try { pass.value = localStorage.getItem("declaude-pass") || ""; } catch {}

// Live count while typing
let t;
function updateLive() {
  const s = score(src.value);
  const over = src.value.length > MAX_CHARS;
  live.innerHTML = s.words
    ? `${s.words} words · <b>${s.total}</b> AI tell${s.total === 1 ? "" : "s"} found by the quick scan${over ? ' · <b class="over">over the 2,000-word limit</b>' : ""}`
    : "0 words";
}
src.addEventListener("input", () => { clearTimeout(t); t = setTimeout(updateLive, 150); });

// Samples
fetch("samples.json").then((r) => r.json()).then((list) => {
  const sel = $("sample");
  list.forEach((s, i) => sel.add(new Option(`Sample: ${s.label}`, i)));
  sel.addEventListener("change", () => {
    if (sel.value === "") return;
    src.value = list[sel.value].text;
    baseName = list[sel.value].label.toLowerCase().replace(/\W+/g, "-");
    showNote("");
    updateLive();
    sel.value = "";
  });
}).catch(() => {});

// Attach a file (button or drag and drop). Text is extracted in the browser.
const MAX_CHARS = 12000;
let baseName = "rewrite";
const fileInput = $("file");
const note = $("file-note");
fileInput.accept = ACCEPT;
const MIN_WORDS = 8;
const countWords = (t) => (t.match(/\b\w+\b/g) || []).length;

// A headline plus an optional list of limitations.
function showNote(msg, items = [], warn = false) {
  note.innerHTML = msg ? `<p>${esc(msg)}</p>${items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}` : "";
  note.hidden = !msg;
  note.classList.toggle("warn", warn);
}

// Problems that would make the server refuse the text, or the result pointless.
function limitProblem(text) {
  const words = countWords(text);
  if (!text.trim()) return "Paste some text or attach a file first.";
  if (text.length > MAX_CHARS) {
    return `This is ${words.toLocaleString()} words (${text.length.toLocaleString()} characters). The limit is about 2,000 words (12,000 characters), so cut it down to the part you want rewritten.`;
  }
  if (words < MIN_WORDS) return `That's only ${words} word${words === 1 ? "" : "s"}. Paste at least a couple of sentences so there's something to rewrite.`;
  return "";
}

async function attach(file) {
  if (!file) return;
  showError("");
  showNote(`Reading ${file.name}…`);
  try {
    const { text, name, notes } = await readFile(file);
    src.value = text;
    baseName = name || "rewrite";
    $("results").hidden = true; // results belonged to the previous text
    result = null;
    updateLive();
    const words = countWords(text);
    const problem = limitProblem(text);
    if (problem) {
      showNote(`${file.name}: ${problem}`, notes, true);
    } else {
      showNote(`${file.name}: ${words.toLocaleString()} words loaded. Check the text looks right, then click deClaude it.`, notes);
    }
  } catch (e) {
    showNote("");
    showError(e.message);
  }
  fileInput.value = "";
}
$("attach").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => attach(fileInput.files[0]));
src.addEventListener("dragover", (e) => { e.preventDefault(); src.classList.add("drop"); });
src.addEventListener("dragleave", () => src.classList.remove("drop"));
src.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return; // plain text drops behave as normal
  e.preventDefault();
  src.classList.remove("drop");
  attach(e.dataTransfer.files[0]);
});

// Legend
$("legend").innerHTML = FAMILIES.map((f) => `
  <div class="fam-${f}"><h4>${f}</h4><ul>${
    Object.entries(PATTERNS).filter(([, p]) => p.family === f).map(([, p]) => `<li>${esc(p.label)}</li>`).join("")
  }</ul></div>`).join("");

function showError(msg) { err.textContent = msg; err.hidden = !msg; }

go.addEventListener("click", async () => {
  const text = src.value.trim();
  const problem = limitProblem(text);
  if (problem) return showError(problem);
  showError("");
  go.disabled = true;
  $("loading").hidden = false;
  $("results").hidden = true;
  const t0 = Date.now();
  const tick = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    $("loading-msg").textContent = s < 25
      ? `Rewriting… ${s}s`
      : `Still working… ${s}s. Free models sometimes queue, and the app moves to another one if needed.`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  try {
    const res = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-passcode": pass.value },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({ error: `Server error (${res.status}).` }));
    if (!res.ok) {
      if (data.needsPasscode) { pass.hidden = false; pass.focus(); }
      throw new Error(data.error || `Server error (${res.status}).`);
    }
    try { localStorage.setItem("declaude-pass", pass.value); } catch {}
    result = { ...data, original: text };
    render();
  } catch (e) {
    showError(e.message);
  } finally {
    clearInterval(timer);
    go.disabled = false;
    $("loading").hidden = true;
  }
});

// Find each snippet in order; fall back to anywhere; skip overlaps.
function locate(text, items) {
  const taken = [];
  let cursor = 0;
  return items.map((it) => {
    if (!it.needle) return null;
    let i = text.indexOf(it.needle, cursor);
    if (i < 0) i = text.indexOf(it.needle);
    if (i < 0) {
      const lower = text.toLowerCase();
      i = lower.indexOf(it.needle.toLowerCase(), cursor);
      if (i < 0) i = lower.indexOf(it.needle.toLowerCase());
    }
    if (i < 0) return null;
    const span = { start: i, end: i + it.needle.length };
    if (taken.some((s) => span.start < s.end && s.start < span.end)) return null;
    taken.push(span);
    cursor = span.end;
    return { ...it, ...span };
  });
}

function paint(text, spans) {
  const list = spans.filter(Boolean).sort((a, b) => a.start - b.start || b.end - a.end);
  let html = "", at = 0;
  for (const s of list) {
    if (s.start < at) continue; // overlaps a span already drawn

    html += esc(text.slice(at, s.start));
    html += `<mark class="hl fam-${s.fam}${s.del ? " del" : ""}" data-n="${s.n}" title="${esc(s.title)}"><sup>${s.n}</sup>${esc(text.slice(s.start, s.end))}</mark>`;
    at = s.end;
  }
  return html + esc(text.slice(at));
}

function renderScore() {
  const { before, after } = result;
  $("b-total").textContent = before.total;
  $("a-total").textContent = after.total;
  $("b-sub").textContent = `${before.per100} per 100 words · ${before.words} words`;
  const delta = before.words ? Math.round(((after.words - before.words) / before.words) * 100) : 0;
  $("a-sub").textContent = `${after.per100} per 100 words · ${after.words} words (${delta > 0 ? "+" : ""}${delta}%)`;
  const max = Math.max(1, ...FAMILIES.map((f) => before.byFamily[f]));
  $("families").innerHTML = FAMILIES.map((f) => `
    <div class="fam fam-${f}">
      <span>${f}</span>
      <span class="bars">
        <span class="b" style="width:${(before.byFamily[f] / max) * 100}%"></span>
        <span class="a" style="width:${(after.byFamily[f] / max) * 100}%"></span>
      </span>
      <span class="n">${before.byFamily[f]} → ${after.byFamily[f]}</span>
    </div>`).join("");
}

function renderColumns() {
  const { original, rewrite, changes } = result;
  const notes = [];
  if (mode === "changes") {
    const items = changes.map((c, i) => ({ n: i + 1, fam: famOf(c.pattern), title: `${labelOf(c.pattern)}: ${c.why}`, before: c.before, after: c.after }));
    const left = locate(original, items.map((it) => ({ ...it, needle: it.before, del: true })));
    const right = locate(rewrite, items.map((it) => ({ ...it, needle: it.after })));
    $("orig").innerHTML = paint(original, left);
    $("rew").innerHTML = paint(rewrite, right);
  } else {
    const tag = (f, i) => ({ n: i + 1, fam: famOf(f.id), title: labelOf(f.id), start: f.start, end: f.end });
    const b = detect(original), a = detect(rewrite);
    $("orig").innerHTML = paint(original, b.filter((f) => !f.doc).map(tag));
    $("rew").innerHTML = paint(rewrite, a.filter((f) => !f.doc).map(tag));
    for (const [name, list] of [["Original", b], ["Rewrite", a]]) {
      for (const f of list.filter((x) => x.doc)) notes.push(`${name}: ${labelOf(f.id)}, ${f.note}.`);
    }
    if (!a.length) notes.push("The rewrite has no tells left that the quick scan can find.");
  }
  $("doc-notes").textContent = notes.join(" ");
  $("doc-notes").hidden = !notes.length;
}

function renderLists() {
  const { changes, kept } = result;
  $("n-changes").textContent = `(${changes.length})`;
  $("changes").innerHTML = changes.map((c, i) => `
    <li class="fam-${famOf(c.pattern)}" data-n="${i + 1}">
      <span class="num">${i + 1}</span>
      <span><span class="chip">${esc(labelOf(c.pattern))}</span></span>
      <span class="diff">
        <del>${esc(c.before)}</del> → ${c.after ? `<ins>${esc(c.after)}</ins>` : `<span class="removed">removed</span>`}
        <span class="why">${esc(c.why)}</span>
      </span>
    </li>`).join("");
  $("kept-wrap").hidden = !kept.length;
  $("kept").innerHTML = kept.map((k) => `<li><q>${esc(k.text)}</q> ${esc(k.why)}</li>`).join("");
  const NAMES = { gemini: "Google Gemini", claude: "Anthropic Claude", openrouter: "OpenRouter", groq: "Groq" };
  const bits = [`Rewritten by ${result.model} (${NAMES[result.provider] || result.provider}) in ${result.seconds}s.`];
  if (result.fellBackFrom?.length) bits.push(`${result.fellBackFrom.map((p) => NAMES[p] || p).join(" and ")} hit a free-tier limit, so the next provider took over.`);
  if (result.repaired) bits.push("A second pass fixed patterns the first draft missed.");
  if (result.autoFixedDashes) bits.push("Leftover dashes were replaced automatically.");
  for (const w of result.warnings || []) bits.push(`Check: ${w}.`);
  $("meta").textContent = bits.join(" ");
}

function render() {
  renderScore();
  renderColumns();
  renderLists();
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Changes / AI tells toggle
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  mode = b.dataset.mode;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-selected", x === b));
  if (result) renderColumns();
}));

// Hovering a change highlights it in both columns and the list (Changes mode only)
function setActive(n, on) {
  if (mode !== "changes") {
    return;
  }
  document.querySelectorAll(`[data-n="${n}"]`).forEach((el) => el.classList.toggle("active", on));
}
for (const id of ["orig", "rew", "changes"]) {
  $(id).addEventListener("mouseover", (e) => { const el = e.target.closest("[data-n]"); if (el) setActive(el.dataset.n, true); });
  $(id).addEventListener("mouseout", (e) => { const el = e.target.closest("[data-n]"); if (el) setActive(el.dataset.n, false); });
}

// Buttons keep their icon; only the text label changes.
function flash(btn, text, ok, ms = 1600) {
  const span = btn.querySelector("span");
  const was = span.textContent;
  span.textContent = text;
  btn.classList.toggle("done", ok);
  setTimeout(() => { span.textContent = was; btn.classList.remove("done"); }, ms);
}
function showOutError(msg) { $("out-err").textContent = msg; $("out-err").hidden = !msg; }

async function download(kind, btn) {
  if (!result) return;
  showOutError("");
  const span = btn.querySelector("span");
  const was = span.textContent;
  try {
    btn.disabled = true;
    if (kind === "docx") { span.textContent = "Preparing…"; await downloadDocx(result.rewrite, baseName); }
    else downloadTxt(result.rewrite, baseName);
    span.textContent = was;
    flash(btn, "Downloaded", true);
  } catch (e) {
    span.textContent = was;
    showOutError(`${e.message || "Download failed."} You can still use Copy and paste the rewrite into a document.`);
  } finally {
    btn.disabled = false;
  }
}
$("dl-docx").addEventListener("click", (e) => download("docx", e.currentTarget));
$("dl-txt").addEventListener("click", (e) => download("txt", e.currentTarget));

$("copy").addEventListener("click", async (e) => {
  if (!result) return;
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(result.rewrite);
    flash(btn, "Copied", true);
  } catch {
    // Clipboard can be blocked (permissions, non-HTTPS). Select the text so Ctrl+C works.
    const range = document.createRange();
    range.selectNodeContents($("rew"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    flash(btn, "Press Ctrl+C", false, 3000);
  }
});

updateLive();
