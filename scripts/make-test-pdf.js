// Writes test/fixtures/sample.pdf: a minimal two-paragraph text PDF for testing the attach feature.
// Usage: node scripts/make-test-pdf.js
import { writeFileSync, mkdirSync } from "node:fs";

const lines = [
  "In today's fast-paced world, finding time to create can feel impossible.",
  "That's where our workshops come in. Whether you're a complete beginner",
  "or a seasoned artist, these sessions offer a welcoming space to grow.",
  "",
  "The first workshop is on Saturday, 8 November, at 10 AM.",
  "Spots are limited to 15 participants.",
];
const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
let y = 760;
const stream = ["BT", "/F1 12 Tf", "14 TL", `72 ${y} Td`, ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

mkdirSync("test/fixtures", { recursive: true });
writeFileSync("test/fixtures/sample.pdf", pdf);
console.log("Wrote test/fixtures/sample.pdf");
