# deClaude: context for Claude Code

MICA OpenProject (40 marks). Build an app and a SKILL.md that "deClaude" AI-written text so readers can't tell it was AI. Live app: https://declaude-nine.vercel.app (class passcode from the team, not in this repo).

## The brief's six deliverables and where they live

| Deliverable | Where | State |
|---|---|---|
| 15+ AI-writing patterns, researched | `docs/research/patterns.md` (24 patterns), `docs/research/repo_notes.md` (21 GitHub repos surveyed) | Done |
| SKILL.md with before/after examples | `skill/SKILL.md` | Done; every "After" example passes our own detectors (`npm test`) |
| App: paste text, get rewrite, see what changed | `app/` (frontend), `api/rewrite.js` (Vercel function) | Live |
| Test on 5 Claude-generated pieces | `docs/test-report/samples-original.md`, `results.md` | Done on Groq `openai/gpt-oss-120b` (official run); Gemini run archived |
| Blind test, 5+ classmates | `docs/blind-test/` | Protocol and scripts ready; waiting on human controls and real responses |
| One-page AI tools and prompts log | `docs/ai-log.md` | Keep adding entries |

## Decisions already made (don't reopen without the team)

- **Hosting:** Vercel Hobby. Frontend in `app/`, one function at `api/rewrite.js`. Every push to `main` redeploys.
- **Engine:** hybrid. `app/detectors.js` scans for the 24 patterns (regex + sentence statistics), the AI rewrites using `skill/SKILL.md` as its system prompt, then the server checks the result and runs at most one repair pass.
- **Change view:** side-by-side original and rewrite with numbered highlights, each change tagged with its pattern, plus a before/after tell count.
- **Providers:** ordered fallback chain set by the `PROVIDER` env var. Live site uses `groq,gemini,openrouter` (all free tiers). Claude is supported (`ANTHROPIC_API_KEY`) but no key is set.
- **Official test run:** Groq `openai/gpt-oss-120b` only, so results are comparable. Don't mix models in the report.
- **Test types:** email, blog post, product description, LinkedIn post, cover letter.

## Rules that protect the grade

- **Never simulate or invent blind-test data.** Only real classmate responses go in `docs/blind-test/`. Report a smaller sample honestly rather than filling gaps.
- **Never commit secrets.** Keys live in `.env.local` (git-ignored) and Vercel env vars. Check `git diff --cached` before committing.
- **Our own writing follows our rules:** no em dashes, no stock AI phrases.
- **SKILL.md is the single source of truth** for rewrite rules. Pattern IDs must match across `patterns.md`, `SKILL.md`, `detectors.js` and the app.
- **Read the rewrites, not just the scores.** The tell count can't see lost facts; earlier runs dropped a reason, a care instruction and a lesson while scoring "clean". Keep a human-review column in the report.
- Log any AI tool or key prompt you use in `docs/ai-log.md`.

## How things work (things that aren't obvious from the code)

- `app/detectors.js` runs in both the browser and the server. It also exports `preservationIssues` (lost numbers, lost contractions) and `droppedSentences` (source sentences with no counterpart in the rewrite). Those feed the repair pass and the "Check:" notes under a result.
- Free providers get a compact SKILL.md (no long worked examples) to fit token-per-minute limits. Groq's free tier is 8,000 tokens/minute on `gpt-oss-120b`, about one rewrite a minute; the live site and test runs share that key.
- The server remembers which models are out of quota and skips them; every AI call has a timeout and each request has an overall deadline (`REQUEST_BUDGET_MS`).
- Post-processing in code, not by the model: em/en dashes replaced (number ranges kept), non-breaking hyphens/spaces normalised, the writer's British/Indian spelling restored.
- **Keep as is:** the writer can mark quotes and examples (select text + "Keep as is", or click a highlight in "AI tells" view). Detectors skip them (`detect(text, { keep })`), and the server swaps each one for a `[[keep-N]]` placeholder before the model sees the text and puts it back after the clean-up, so neither the model nor dash stripping can change it. Asking the model to leave them alone did not work: Groq changed 15 of 33.
- **Slides:** text with `--- Slide N ---` lines is treated as a deck. Detectors skip rhythm checks and list triads on label lines, the mid-sentence truncation check is off, and the server checks every marker survives. `app/pdf-layout.js` builds those markers from landscape PDFs: it rebuilds lines from positioned text, orders columns before rows, and drops page numbers, repeated footers and off-page text.
- **Reading files, in layers:** (1) the file's own text; (2) Tesseract in the browser for images and PDF pages with no text layer; (3) "Read with AI" (`api/ocr.js`, Gemini then OpenRouter Gemma), only on click. Layer 3 also returns crossed-out text, which becomes "keep as is". When the PDF has a text layer, each AI line is matched back to it so the wording and punctuation are the file's, not the model's (vision models drop hyphens and em dashes). Groq has no free vision model.
- Known weak models: Groq Qwen truncated a rewrite; `gpt-oss-20b` barely edited. Neither is a default.

## Commands

```bash
npm install
npm test                      # detector tests + SKILL.md example check
npm run mock                  # UI with a canned reply, no API key needed
npm run dev                   # real backend, reads .env.local
node scripts/run-tests.js <url> [--fresh]   # rewrite the 5 samples, write docs/test-report/results.md
node scripts/build-blind-test.js            # needs human-controls.md filled in
node scripts/analyze-blind-test.js          # needs responses-A.csv / responses-B.csv
```

Windows note: don't edit files with PowerShell `Get-Content`/`Set-Content`; it garbles non-ASCII characters (it broke the dash regexes once). Use the editor tools.

## What's left

1. Teammates write five human controls in `docs/blind-test/human-controls.md` (no AI).
2. `node scripts/build-blind-test.js`, then put Form A and Form B into Google Forms.
3. Collect at least 5 real responses (aim for 10+), export to `responses-A.csv` / `responses-B.csv`, run the analysis.
4. Write the test report (before/after samples, human review, blind-test results, limitations) and trim `docs/ai-log.md` to one page.
