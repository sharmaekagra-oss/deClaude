import { detect, score, PATTERNS, FAMILIES } from "./detectors.js";

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
  live.innerHTML = s.words
    ? `${s.words} words · <b>${s.total}</b> AI tell${s.total === 1 ? "" : "s"} found by the quick scan`
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
    updateLive();
    sel.value = "";
  });
}).catch(() => {});

// Legend
$("legend").innerHTML = FAMILIES.map((f) => `
  <div class="fam-${f}"><h4>${f}</h4><ul>${
    Object.entries(PATTERNS).filter(([, p]) => p.family === f).map(([, p]) => `<li>${esc(p.label)}</li>`).join("")
  }</ul></div>`).join("");

function showError(msg) { err.textContent = msg; err.hidden = !msg; }

go.addEventListener("click", async () => {
  const text = src.value.trim();
  if (!text) return showError("Paste some text first.");
  showError("");
  go.disabled = true;
  $("loading").hidden = false;
  $("results").hidden = true;
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
  const bits = [`Rewritten by ${result.model} in ${result.seconds}s.`];
  if (result.repaired) bits.push("A second pass fixed patterns the first draft missed.");
  if (result.autoFixedDashes) bits.push("Leftover dashes were replaced automatically.");
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

$("copy").addEventListener("click", async () => {
  if (!result) return;
  try {
    await navigator.clipboard.writeText(result.rewrite);
    $("copy").textContent = "Copied";
  } catch {
    $("copy").textContent = "Copy failed";
  }
  setTimeout(() => ($("copy").textContent = "Copy rewrite"), 1500);
});

updateLive();
