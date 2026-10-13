# deClaude

Paste AI-written text, get a version that reads like a person wrote it, and see exactly what changed and why.

MICA OpenProject · 40 marks

## Deliverables

| Deliverable | Location | Status |
|---|---|---|
| AI-writing pattern list (15+) | `docs/research/patterns.md` | Not started |
| SKILL.md with before/after examples | `skill/SKILL.md` | Not started |
| Working app (Vercel link) | `app/` | Not started |
| Test report: 5 samples, before/after | `docs/test-report/` | Not started |
| Blind test: 5+ classmates, results | `docs/blind-test/` | Not started |
| One-page AI tools and prompts log | `docs/ai-log.md` | Not started |

## Agreed parameters

- **Hosting:** Vercel Hobby (free). Frontend plus one serverless function at `/api/rewrite`. The API key lives only in Vercel environment variables.
- **Engine:** hybrid. Rule-based detectors flag patterns first, then Claude rewrites using `skill/SKILL.md` as its rules.
- **Change view:** side-by-side original and rewrite, with each change annotated by the pattern it fixed.
- **Test set:** email, blog post, product description, LinkedIn post, cover letter.
- **Blind test:** at least 5 real classmates. Raw responses are kept in `docs/blind-test/`. No simulated responses.

## Repo layout

```
app/            Web app (frontend + /api serverless function)
skill/          SKILL.md, the single source of truth for rewrite rules
docs/research/  GitHub repo survey, pattern list, sources
docs/test-report/  The 5 test pieces, before and after
docs/blind-test/   Form, answer key, raw responses, results
docs/ai-log.md  AI tools and key prompts used (keep this updated as you go)
```

## Getting started

```bash
git clone <repo-url>
cd declaude
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how we work together.
