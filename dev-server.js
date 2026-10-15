// Local stand-in for Vercel: serves app/ and routes /api/rewrite to the same handler.
// Run with: npm run dev   (reads ANTHROPIC_API_KEY from .env.local)
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.dirname(fileURLToPath(import.meta.url)));
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { default: rewrite } = await import("./api/rewrite.js");

const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/rewrite") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    // MOCK=1 returns a canned response so the UI can be tested without an API key.
    if (process.env.MOCK === "1") {
      const { score } = await import("./app/detectors.js");
      const m = JSON.parse(await readFile("test/fixtures/mock-response.json", "utf8"));
      return res.json({ ...m, before: score(m.original), after: score(m.rewrite), repaired: false, autoFixedDashes: false, model: "mock (no API call)", seconds: 0 });
    }
    return rewrite(req, res);
  }

  // Folder addresses serve their index.html, as on Vercel.
  const rel = (url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname).slice(1);
  const file = path.join("app", path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.requestTimeout = 0; // free-tier rewrites can take longer than Node's 5-minute default
server.listen(PORT, () => console.log(`deClaude running at http://localhost:${PORT}`));
