# deClaude

Paste AI-written text, get a version that reads like a person wrote it, and see exactly what changed and why.

MICA OpenProject · 40 marks

**Live app: https://declaude-nine.vercel.app** (ask the team for the class passcode)

## Deliverables

| Deliverable | Location | Status | Owner |
|---|---|---|---|
| AI-writing pattern list (15+) | [docs/research/patterns.md](docs/research/patterns.md) | Done: 24 patterns, sourced | |
| GitHub repo survey | [docs/research/repo_notes.md](docs/research/repo_notes.md) | Done: 21 repos | |
| SKILL.md with before/after examples | [skill/SKILL.md](skill/SKILL.md) | Done: 8 short + 3 full examples, all pass our own detectors | |
| Working app | [declaude-nine.vercel.app](https://declaude-nine.vercel.app) | Live on Vercel, running on the Gemini free tier, passcode-protected | |
| Test samples (5 Claude originals) | [docs/test-report/samples-original.md](docs/test-report/samples-original.md) | Done | |
| Test report: before/after | `docs/test-report/results.md` | Run `scripts/run-tests.js` once the app has a key | |
| Human-written controls | [docs/blind-test/human-controls.md](docs/blind-test/human-controls.md) | **Teammates to write (no AI)** | |
| Blind test: 5+ classmates | [docs/blind-test/PROTOCOL.md](docs/blind-test/PROTOCOL.md) | Protocol and scripts ready. Needs real responses | |
| One-page AI tools and prompts log | [docs/ai-log.md](docs/ai-log.md) | Keep adding as you go | |
| Presentation deck (10 slides) | Live at [declaude-nine.vercel.app/deck](https://declaude-nine.vercel.app/deck/) · source [app/deck/index.html](app/deck/index.html) · [PDF](app/deck/deClaude-deck.pdf) | Done; blind-test slide waits for real results | |

## How it works

1. **Quick scan (in the browser).** `app/detectors.js` runs regex and sentence-length checks for the 24 patterns and counts tells as you type.
2. **Rewrite (on the server).** `api/rewrite.js` sends the text to Claude with `skill/SKILL.md` as the system prompt, plus the scan results as hints. Claude returns the rewrite and a list of changes, each tagged with a pattern ID.
3. **Check.** The server scans the rewrite. If hard patterns survived (em dashes, stock openers, chatbot residue and so on), Claude gets one repair pass. Any dash that still survives is replaced automatically, because the brief requires zero.
4. **Files.** "Attach file" (or drag and drop) reads `.docx`, `.pdf`, `.txt` and `.md` in the browser with mammoth.js and pdf.js; the file is never uploaded, only its text is sent for rewriting. The rewrite downloads as `.docx` or `.txt`. Formatting (bold, headings, tables) isn't kept, scanned PDFs need OCR first, and the 2,000-word limit still applies.
5. **Show.** The page shows a before/after tell count by family, the original and the rewrite side by side with numbered highlights linking each change, and the list of changes with reasons. An "AI tells" toggle shows the raw scan on both versions.

## Run it locally

Needs Node 20 or later.

```bash
npm install
```

To see the UI with a canned reply (no API key, no cost):

```bash
npm run mock
```

To run it for real, copy `.env.example` to `.env.local`, add an API key (`GOOGLE_API_KEY` for the free Gemini tier, `ANTHROPIC_API_KEY` for Claude, or both), then:

```bash
npm run dev
```

Open http://localhost:3000 (or the port in `PORT`). Run the checks with `npm test`.

## Deploy to Vercel (free Hobby plan)

1. Go to vercel.com, sign in with GitHub, and click **Add New → Project**. Import `sharmaekagra-oss/deClaude`.
2. Leave the framework as **Other**. `vercel.json` already sets the output folder (`app`) and the function settings.
3. Under **Environment Variables**, add `GOOGLE_API_KEY` (free) and/or `ANTHROPIC_API_KEY`. Optionally add `APP_PASSCODE` (a word you give classmates) and `PROVIDER` (`gemini` or `claude`).
4. Click **Deploy**. Every push to `main` redeploys, and every pull request gets a preview link.
5. If you use Claude, set a monthly spend limit on the key in the Anthropic Console.

**Providers.** The app reads the same `skill/SKILL.md` whichever model runs it.

| | Gemini (free tier) | Claude |
|---|---|---|
| Key | `GOOGLE_API_KEY` from aistudio.google.com | `ANTHROPIC_API_KEY` from console.anthropic.com |
| Default model | `gemini-3.8-flash`, then `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-flash-lite-latest` if a model is overloaded or retired | `claude-opus-5-5` |
| Cost | Free within Google's quota | Roughly 5 to 15 US cents per rewrite |
| Speed (first test) | About 140 s for a 270-word LinkedIn post | Not yet measured |
| Note | Google may use free-tier inputs to improve its products. Don't paste private text. | The brief's SKILL.md is written for Claude, so use Claude for the official test runs. |

**OpenRouter (free backup).** `OPENROUTER_API_KEY` from openrouter.ai. Uses free `:free` models that can return JSON (default: `nvidia/nemotron-3-super-120b-a12b:free`, then two Gemma 4 models; change with `OPENROUTER_MODELS`). The limits are 20 requests a minute and 50 a day, or 1,000 a day once the account has bought $10 of credit. As of 13 October 2026 there are no Chinese models (DeepSeek, Qwen, GLM, Kimi) on the free list.

**Fallback order.** `PROVIDER` is a comma-separated list tried in order, e.g. `gemini,openrouter`. When one provider is out of quota or overloaded, the next takes over, and the app says so under the result. With `PROVIDER` unset, every provider that has a key is used in the order Claude, Gemini, OpenRouter.

**Claude model and cost.** The default is `claude-opus-5-5` ($4 per million input tokens, $20 per million output). A rewrite of a 300-word piece sends the SKILL.md (about 6,000 tokens, cached after the first call) plus the text. Most of the cost is the output: the rewrite, the change list and the model's thinking. Expect roughly 5 to 15 US cents per rewrite; check real usage in the Console after the first few runs. Setting `CLAUDE_MODEL=claude-haiku-5-5` costs about a fortieth as much, but test whether quality holds first.

## Repo layout

```
app/              Frontend: index.html, app.js, styles.css, detectors.js, samples.json
api/rewrite.js    Serverless function that calls Claude
skill/SKILL.md    The rewrite rules (single source of truth)
scripts/          run-tests.js, build-samples.js, build-blind-test.js, analyze-blind-test.js
test/             Detector tests and the SKILL.md example check
docs/research/    Repo survey and pattern list
docs/test-report/ Original samples and the before/after results
docs/blind-test/  Protocol, human controls, forms, responses, results
docs/ai-log.md    AI tools and key prompts used
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how we work together.
