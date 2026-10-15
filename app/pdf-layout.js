// Reading order for slide-style PDFs. pdf.js gives text as positioned pieces; slides put them in
// columns, boxes and stamps, so plain item order mixes them up. This groups pieces into lines,
// orders lines by cutting the page at its widest gaps (columns before rows), and drops page
// furniture such as page numbers, repeated footers and text running off the page edge.
// Pure functions, so they run in the browser and in Node tests.

// items: pdf.js getTextContent().items; width/height: the page viewport at scale 1.
export function pageLines(items, width, height) {
  const pieces = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [, , c, d, x, y] = it.transform;
    const h = Math.hypot(c, d) || it.height || 10;
    const w = it.width || 0;
    // Off-page text: scrolling tickers and decorations cut by the page edge.
    if (x < -0.5 || x + w > width + 0.5 || y < 0 || y > height) continue;
    pieces.push({ str: it.str, x, y, w, h });
  }

  // Pieces on the same baseline (allowing for slightly rotated text) that sit close together
  // horizontally become one line. Wide horizontal gaps start a new line: that's another column.
  const lines = [];
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);
  for (const p of pieces) {
    const line = lines.find((l) => {
      const near = l.pieces.reduce((best, q) => (Math.abs(q.x - p.x) < Math.abs(best.x - p.x) ? q : best));
      const size = Math.min(p.h, l.h);
      if (Math.abs(near.y - p.y) > size * 0.6 || Math.abs(p.h - l.h) > size * 0.5) return false;
      const gap = p.x > l.right ? p.x - l.right : l.left - (p.x + p.w);
      return gap < Math.max(p.h, l.h) * 1.5;
    });
    if (line) {
      line.pieces.push(p);
      line.left = Math.min(line.left, p.x);
      line.right = Math.max(line.right, p.x + p.w);
      line.top = Math.max(line.top, p.y + p.h * 0.8);
      line.bottom = Math.min(line.bottom, p.y - p.h * 0.2);
    } else {
      lines.push({ pieces: [p], h: p.h, left: p.x, right: p.x + p.w, top: p.y + p.h * 0.8, bottom: p.y - p.h * 0.2 });
    }
  }
  for (const l of lines) {
    l.pieces.sort((a, b) => a.x - b.x);
    let text = "";
    let prev = null;
    for (const p of l.pieces) {
      const gap = prev ? p.x - (prev.x + prev.w) : 0;
      if (prev && gap > p.h * 0.15 && !/\s$/.test(text) && !/^\s/.test(p.str)) text += " ";
      text += p.str;
      prev = p;
    }
    l.text = text.replace(/\s+/g, " ").trim();
  }
  return joinWrapped(order(lines));
}

// Recursive XY cut: split at the widest empty gap, vertical (between columns) or horizontal
// (between rows), and read each part in turn.
function order(lines) {
  if (lines.length <= 1) return lines;
  const gapAlong = (lo, hi, desc) => {
    const spans = lines.map((l) => [lo(l), hi(l)]).sort((a, b) => (desc ? b[1] - a[1] : a[0] - b[0]));
    let best = { size: 0, at: null };
    let reach = desc ? spans[0][0] : spans[0][1];
    for (const [a, b] of spans.slice(1)) {
      const size = desc ? reach - b : a - reach;
      if (size > best.size) best = { size, at: desc ? (reach + b) / 2 : (reach + a) / 2 };
      reach = desc ? Math.min(reach, a) : Math.max(reach, b);
    }
    return best;
  };
  const col = gapAlong((l) => l.left, (l) => l.right, false);
  const row = gapAlong((l) => l.bottom, (l) => l.top, true);
  if (col.size >= 12 && col.size >= row.size) {
    return [...order(lines.filter((l) => l.right <= col.at)), ...order(lines.filter((l) => l.right > col.at))];
  }
  if (row.size > 0) {
    return [...order(lines.filter((l) => l.bottom >= row.at)), ...order(lines.filter((l) => l.bottom < row.at))];
  }
  return [...lines].sort((a, b) => b.top - a.top || a.left - b.left);
}

// A sentence wrapped over several lines comes back as one line: same size, aligned, close, and
// the next line starts in lower case ("that deClaude AI-generated" after "Build an app and a").
function joinWrapped(lines) {
  const out = [];
  for (const l of lines) {
    const last = out.at(-1);
    if (last && Math.abs(last.h - l.h) < l.h * 0.15 && Math.abs(last.left - l.left) < l.h * 1.5 &&
        last.bottom - l.top < l.h * 0.8 && last.bottom > l.top - l.h && /^[a-z(,:;]/.test(l.text)) {
      last.text += /^[,:;]/.test(l.text) ? l.text : ` ${l.text}`;
      last.bottom = l.bottom;
      continue;
    }
    out.push({ ...l });
  }
  return out.map(({ text, top, bottom, h }) => ({ text, top, bottom, h }));
}

// pages: [{ lines, height }]. Drops page numbers ("3 / 10") and headers or footers that repeat
// across pages, then returns each page's text.
export function dropFurniture(pages) {
  const norm = (t) => t.toLowerCase().replace(/\d+/g, "#");
  const firstWord = (t) => (t.toLowerCase().match(/^[\p{L}]{3,}/u) || [""])[0];
  const band = (l, p) => l.top > p.height * 0.93 || l.bottom < p.height * 0.07;
  const count = (key) => {
    const m = new Map();
    for (const p of pages) for (const k of new Set(p.lines.map((l) => key(l, p)).filter(Boolean))) m.set(k, (m.get(k) || 0) + 1);
    return m;
  };
  const enough = Math.max(3, Math.ceil(pages.length * 0.5));
  const repeated = count((l) => norm(l.text));
  const bandWords = count((l, p) => (band(l, p) ? firstWord(l.text) : ""));
  return pages.map((p) => p.lines
    .filter((l) => !/^(?:page\s*)?\d+\s*(?:\/|of)\s*\d+$/i.test(l.text))
    .filter((l) => pages.length < 3 || (repeated.get(norm(l.text)) || 0) < enough)
    .filter((l) => pages.length < 3 || !band(l, p) || (bandWords.get(firstWord(l.text)) || 0) < enough)
    .map((l) => l.text)
    .join("\n"));
}

// Landscape pages with little text each: a slide deck, not a document.
export function looksLikeSlides(pages) {
  if (pages.length < 2) return false;
  const wide = pages.filter((p) => p.width > p.height * 1.15).length;
  const words = pages.reduce((n, p) => n + (p.words || 0), 0) / pages.length;
  return wide >= pages.length * 0.6 && words <= 160;
}
