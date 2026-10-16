import { detect, score, quotations, PATTERNS, FAMILIES } from "./detectors.js";
import { ACCEPT, readFile, readWithAI, canReadWithAI, downloadTxt, downloadDocx } from "./files.js";

const $ = (id) => document.getElementById(id);
const src = $("src"), live = $("live"), go = $("go"), pass = $("pass"), err = $("err");
let result = null;
let mode = "changes";

const famOf = (id) => (PATTERNS[id] ? PATTERNS[id].family : "Other");
const labelOf = (id) => (PATTERNS[id] ? PATTERNS[id].label : "Clarity edit");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

try { pass.value = localStorage.getItem("declaude-pass") || ""; } catch {}

// "Keep as is": quotes and examples the writer wants left exactly as written. They aren't
// counted as tells, the rewrite must copy them unchanged, and the server checks that it did.
let keep = [];
function renderKeeps() {
  $("keeps").hidden = !keep.length;
  $("keep-list").innerHTML = keep.map((k, i) => `<li><q>${esc(k.length > 80 ? `${k.slice(0, 77)}…` : k)}</q><button type="button" data-i="${i}" title="Stop keeping this" aria-label="Stop keeping this passage">×</button></li>`).join("");
}
function addKeep(text) {
  const k = text.trim();
  if (k.length < 2 || keep.includes(k)) return false;
  keep.push(k);
  renderKeeps();
  updateLive();
  return true;
}
$("keep-list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  keep.splice(+b.dataset.i, 1);
  renderKeeps();
  updateLive();
  if (result) renderColumns();
});
$("keep").addEventListener("click", () => {
  const picked = src.value.slice(src.selectionStart, src.selectionEnd);
  if (!picked.trim()) return showError("Select a quote or example in your text first, then click Keep as is.");
  showError("");
  addKeep(picked);
});

// Quotations are someone's exact words, so they start out kept. The writer can remove any with ×.
function keepQuotes(text) {
  const found = quotations(text).filter((q) => !keep.includes(q));
  keep.push(...found);
  renderKeeps();
  return found.length ? `${found.length} quotation${found.length > 1 ? "s were" : " was"} added to "Keep as is", since ${found.length > 1 ? "they're" : "it's"} someone's exact words. Remove any that should be rewritten.` : "";
}
src.addEventListener("paste", () => setTimeout(() => {
  const msg = keepQuotes(src.value);
  if (msg) { showNote(msg); updateLive(); }
}));

// Live count while typing
let t;
function updateLive() {
  // Kept passages that were edited away no longer apply.
  const before = keep.length;
  keep = keep.filter((k) => src.value.includes(k));
  if (keep.length !== before) renderKeeps();
  const s = score(src.value, { keep });
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
    keep = [];
    renderKeeps();
    lastFile = null;
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
const countWords = (t) => (t.match(/[\p{L}\p{M}\p{N}]+/gu) || []).length; // any script, not just Latin

// A headline plus an optional list of limitations, and for PDFs and images a "Read with AI" button.
function showNote(msg, items = [], warn = false, offerAI = false) {
  const ai = offerAI
    ? `<div class="note-actions"><button id="read-ai" type="button" class="btn icon-btn"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>Read with AI</span></button><span>Better for designed slides and scans, and spots crossed-out text. Uses free AI quota.</span></div>`
    : "";
  note.innerHTML = msg ? `<p>${esc(msg)}</p>${items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}${ai}` : "";
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

// Puts newly read text in the box and reports what happened.
function loaded(file, { text, name, notes: given }) {
  let notes = given;
  src.value = text;
  baseName = name || "rewrite";
  $("results").hidden = true; // results belonged to the previous text
  result = null;
  const quoted = keepQuotes(text);
  if (quoted) notes = [...notes, quoted];
  updateLive();
  const problem = limitProblem(text);
  const offerAI = canReadWithAI(file);
  if (problem) showNote(`${file.name}: ${problem}`, notes, true, offerAI);
  else showNote(`${file.name}: ${countWords(text).toLocaleString()} words loaded. Check the text looks right, then click Strip it.`, notes, false, offerAI);
}

let lastFile = null;
async function attach(file) {
  if (!file) return;
  showError("");
  showNote(`Reading ${file.name}…`);
  try {
    const read = await readFile(file, (msg) => showNote(`${file.name}: ${msg}`));
    keep = [];
    lastFile = file;
    loaded(file, read);
  } catch (e) {
    showNote("");
    showError(e.message);
    // A scan the browser couldn't read may still be readable by the AI reader.
    if (canReadWithAI(file)) { lastFile = file; showNote(`${file.name}: the normal reader found nothing usable.`, [], true, true); }
  }
  fileInput.value = "";
}

// Layer 3 of reading: a vision model, only when the user asks for it.
note.addEventListener("click", async (e) => {
  const btn = e.target.closest("#read-ai");
  if (!btn || !lastFile) return;
  const file = lastFile;
  showError("");
  btn.disabled = true;
  try {
    const read = await readWithAI(file, pass.value, (msg) => showNote(`${file.name}: ${msg}`));
    try { localStorage.setItem("declaude-pass", pass.value); } catch {}
    keep = read.keep;
    loaded(file, read);
    note.querySelector(".note-actions")?.remove(); // already read with AI; the notes stay
  } catch (err) {
    if (err.needsPasscode) { pass.hidden = false; pass.focus(); }
    showNote(`${file.name}: the AI reader didn't finish.`, [], true, true);
    showError(err.needsPasscode ? "Enter the class passcode (next to Strip it), then click Read with AI again." : err.message);
  }
});
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

function httpMessage(status) {
  if (status === 504 || status === 408) return "The rewrite took too long and timed out. Try again, or try a shorter text.";
  if (status === 413) return "That text is too long for the server. Cut it down and try again.";
  if (status === 429) return "Too many rewrites right now. Wait a minute and try again.";
  if (status >= 500) return `The server had a problem (error ${status}). Try again in a minute.`;
  return `Something went wrong (error ${status}). Try again.`;
}

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
    let res;
    try {
      res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-passcode": pass.value },
        body: JSON.stringify({ text, keep }),
      });
    } catch {
      throw new Error("Couldn't reach the deClaude server. Check your internet connection and try again.");
    }
    // A non-JSON reply means the hosting platform answered, not our code (usually a timeout).
    const data = await res.json().catch(() => ({ error: httpMessage(res.status) }));
    if (!res.ok) {
      if (data.needsPasscode) { pass.hidden = false; pass.focus(); }
      throw new Error(data.error || httpMessage(res.status));
    }
    if (typeof data.rewrite !== "string" || !data.rewrite.trim()) {
      throw new Error("The AI sent back an empty rewrite. Try again.");
    }
    try { localStorage.setItem("declaude-pass", pass.value); } catch {}
    data.changes = (Array.isArray(data.changes) ? data.changes : []).filter((c) => c && typeof c.before === "string" && c.before.trim());
    data.kept = Array.isArray(data.kept) ? data.kept : [];
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

// kind: "pen" = struck out in the original, "ins" = new text in the rewrite (both numbered),
// "hl" = an AI tell under the highlighter.
function paint(text, spans, kind) {
  const list = spans.filter(Boolean).sort((a, b) => a.start - b.start || b.end - a.end);
  let html = "", at = 0;
  for (const s of list) {
    if (s.start < at) continue; // overlaps a span already drawn
    html += esc(text.slice(at, s.start));
    const num = kind === "hl" ? "" : `<span class="n" aria-hidden="true">${s.n}</span>`;
    const tag = kind === "pen" ? "del" : kind === "ins" ? "ins" : "mark";
    html += `${num}<${tag} class="${kind}" data-n="${s.n}" title="${esc(s.title)}">${esc(text.slice(s.start, s.end))}</${tag}>`;
    at = s.end;
  }
  return html + esc(text.slice(at));
}

function renderScore() {
  const { before, after } = result;
  $("b-total").textContent = before.total;
  $("a-total").textContent = after.total;
  $("b-sub").textContent = `${before.words} words`;
  const delta = before.words ? Math.round(((after.words - before.words) / before.words) * 100) : 0;
  $("a-sub").textContent = `${after.words} words (${delta > 0 ? "+" : ""}${delta}%)`;
  const cut = before.total - after.total;
  $("verdict").textContent = after.total === 0 ? (before.total ? "Clean." : "Already clean.")
    : after.total < before.total ? "Mostly clean." : "Still sus.";
  const caught = FAMILIES.filter((f) => before.byFamily[f]).map((f) => `${before.byFamily[f]} ${f.toLowerCase()}`);
  $("families").textContent = before.total
    ? `Caught ${caught.join(" · ")}${cut > 0 ? `. ${cut} gone.` : "."}`
    : "The quick scan found nothing to catch.";
  const stamp = $("stamp-after");
  stamp.textContent = after.total === 0 ? "Human-ish" : "Mostly human";
  stamp.className = `stamp ${after.total === 0 ? "ok" : "meh"}`;
  $("orig-count").textContent = `${before.total} tell${before.total === 1 ? "" : "s"}`;
}

function renderColumns() {
  const { original, rewrite, changes } = result;
  const notes = [];
  if (mode === "changes") {
    const items = changes.map((c, i) => ({ n: i + 1, fam: famOf(c.pattern), title: `${labelOf(c.pattern)}: ${c.why}`, before: c.before, after: c.after }));
    const left = locate(original, items.map((it) => ({ ...it, needle: it.before, del: true })));
    const right = locate(rewrite, items.map((it) => ({ ...it, needle: it.after })));
    $("orig").innerHTML = paint(original, left, "pen");
    $("rew").innerHTML = paint(rewrite, right, "ins");
  } else {
    const tag = (f, i) => ({ n: i + 1, title: labelOf(f.id), start: f.start, end: f.end });
    const b = detect(original, { keep }), a = detect(rewrite, { keep });
    $("orig").innerHTML = paint(original, b.filter((f) => !f.doc).map(tag), "hl");
    $("rew").innerHTML = paint(rewrite, a.filter((f) => !f.doc).map(tag), "hl");
    for (const [name, list] of [["Original", b], ["Rewrite", a]]) {
      for (const f of list.filter((x) => x.doc)) notes.push(`${name}: ${labelOf(f.id)}, ${f.note}.`);
    }
    if (!a.length) notes.push("The rewrite has no tells left that the quick scan can find.");
    if (b.some((f) => !f.doc)) notes.push("Click a highlight in the original to keep it as is (a quote or an example), then Strip it again.");
  }
  $("doc-notes").textContent = notes.join(" ");
  $("doc-notes").hidden = !notes.length;
}

function renderLists() {
  const { changes, kept } = result;
  $("n-changes").textContent = `(${changes.length})`;
  $("changes").innerHTML = !changes.length
    ? `<li class="empty">No changes needed. The text already reads like a person wrote it${result.after?.total ? `, though the quick scan still flags ${result.after.total} possible tell${result.after.total === 1 ? "" : "s"}; switch to "AI tells" to see them` : ""}.</li>`
    : changes.map((c, i) => `
    <li data-n="${i + 1}">
      <span class="n" aria-label="Edit ${i + 1}">${i + 1}</span>
      <span><span class="chip">${esc(labelOf(c.pattern))}</span></span>
      <span class="diff">
        <del>${esc(c.before)}</del> → ${c.after ? `<ins>${esc(c.after)}</ins>` : `<span class="removed">cut</span>`}
        <span class="why">${esc(c.why)}</span>
      </span>
    </li>`).join("");
  $("kept-wrap").hidden = !kept.length;
  $("kept").innerHTML = kept.map((k) => `<li><q>${esc(k.text)}</q> ${esc(k.why)}</li>`).join("");
  const NAMES = { gemini: "Google Gemini", claude: "Anthropic Claude", openrouter: "OpenRouter", groq: "Groq" };
  const bits = [`Rewritten by ${result.model} (${NAMES[result.provider] || result.provider}) in ${result.seconds}s.`];
  if (result.fellBackFrom?.length) bits.push(`${result.fellBackFrom.map((p) => NAMES[p] || p).join(" and ")} hit a free-tier limit, so the next provider took over.`);
  if (result.repaired) bits.push("A second pass fixed patterns the first draft missed.");
  if (result.repairSkipped) bits.push("A second pass was due but the free model was busy, so this is the first draft.");
  if (result.autoFixedDashes) bits.push("Leftover dashes were replaced automatically.");
  for (const w of result.warnings || []) bits.push(`Check: ${w}.`);
  $("meta").textContent = bits.join(" ");
}

function render() {
  editing = false;
  $("rew").hidden = false;
  $("rew-edit").hidden = true;
  $("edit").querySelector("span").textContent = "Edit";
  renderScore();
  renderColumns();
  renderLists();
  renderTurn();
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

// "Your turn": sentences the model thinks still read as anyone's, with a question only the writer can answer.
function renderTurn() {
  const items = Array.isArray(result.yourTurn) ? result.yourTurn : [];
  $("turn-wrap").hidden = !items.length;
  $("turn").innerHTML = items.map((y, i) => `
    <li data-i="${i}" tabindex="0" role="button" class="${result.rewrite.includes(y.sentence) ? "" : "done"}">
      <span><q>${esc(y.sentence)}</q><span class="ask">${esc(y.ask)}</span></span>
    </li>`).join("");
}

// Edit the rewrite in place. Copy, download and the after-score all follow the edited text.
let editing = false;
function enterEdit(focusSentence) {
  if (!result) return;
  editing = true;
  const ta = $("rew-edit");
  ta.value = result.rewrite;
  $("rew").hidden = true;
  ta.hidden = false;
  $("edit").querySelector("span").textContent = "Done";
  ta.focus();
  const at = focusSentence ? ta.value.indexOf(focusSentence) : -1;
  if (at >= 0) {
    ta.setSelectionRange(at, at + focusSentence.length);
    // Scroll the selection into view: approximate by line position.
    const line = ta.value.slice(0, at).split("\n").length;
    ta.scrollTop = Math.max(0, (line - 3) * 31);
  }
}
function exitEdit() {
  editing = false;
  $("rew-edit").hidden = true;
  $("rew").hidden = false;
  $("edit").querySelector("span").textContent = "Edit";
  renderScore();
  renderColumns();
  renderTurn();
}
$("edit").addEventListener("click", () => (editing ? exitEdit() : enterEdit()));
$("rew-edit").addEventListener("input", (e) => {
  result.rewrite = e.target.value;
  result.edited = true;
  result.after = score(result.rewrite, { keep });
  renderScore();
});

// In "AI tells" view, clicking a flagged phrase in the original marks it "keep as is".
$("orig").addEventListener("click", (e) => {
  const m = e.target.closest("mark.hl");
  if (!m || mode !== "tells") return;
  if (addKeep(m.textContent)) {
    renderColumns();
    $("doc-notes").textContent = `Keeping "${m.textContent}" as is. Click Strip it to rewrite with it kept.`;
    $("doc-notes").hidden = false;
  }
});
$("turn").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-i]");
  if (li) enterEdit(result.yourTurn[+li.dataset.i].sentence);
});
$("turn").addEventListener("keydown", (e) => {
  const li = e.target.closest("li[data-i]");
  if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); enterEdit(result.yourTurn[+li.dataset.i].sentence); }
});

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
