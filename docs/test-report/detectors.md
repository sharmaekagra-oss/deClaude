# AI detector test

**Question:** after deClaude, do leading AI detectors still flag the text?

**Texts:** the five Claude-written originals and their official rewrites from `results.md` (Groq `openai/gpt-oss-120b`). Human-written controls get a column once teammates have written them (`docs/blind-test/human-controls.md`), so we can see how often each detector wrongly flags real human writing.

**Detectors:** free web versions, used without an account. GPTZero (Basic AI Scan, model 4.1o) stopped after 5 scans and asked for a sign-up; QuillBot asked for a sign-up before the first scan. Sapling worked without one.

## Round 1: baseline (app as shipped, 2026-10-15)

Share of the text each detector called AI. Higher means "more likely AI".

| Piece | GPTZero: original | GPTZero: rewrite | Sapling: original | Sapling: rewrite |
|---|---|---|---|---|
| Email | 100% | 100% | 99.9% | 87.4% |
| Blog post | 100% | 100% | 99.5% | 0.0% * |
| Product description | n/a | n/a | 99.9% | 88.1% |
| LinkedIn post | 100% | not counted ** | 98.0% | 99.1% |
| Cover letter | n/a | n/a | 99.5% | 96.0% |

\* Reproduced twice. The rewrite is nearly the original minus its bold labels, so this says more about Sapling's instability than about the rewrite.
\** GPTZero hit its anonymous limit during this scan; the number on screen was stale.

## Round 2: after the improvements (2026-10-15)

Changes since round 1: SKILL.md now pushes varied sentence and paragraph length and less predictable wording; a flat rhythm triggers the repair pass; the app returns "Your turn" questions (not applied here: those need the writer's own details, and we don't fake them). Rewrites are the new official run in `results.md` (32 tells → 7).

| Piece | Sapling: original | Sapling: rewrite, round 1 | Sapling: rewrite, round 2 |
|---|---|---|---|
| Email | 99.9% | 87.4% | 87.5% |
| Blog post | 99.5% | 0.0% | 0.0% |
| Product description | 99.9% | 88.1% | 96.4% |
| LinkedIn post | 98.0% | 99.1% | 0.0% |
| Cover letter | 99.5% | 96.0% | 100% |

GPTZero was not re-run: its free anonymous scans ran out in round 1 and it needs an account.

**Reading:**
- On Sapling, round 2 moved two pieces to 0% and pushed two others up. With swings this large on near-identical text, Sapling's score tells us little either way.
- Nothing here suggests the rewrites now pass a strong detector. GPTZero called everything it saw 100% AI.
- The honest summary for the report: deClaude makes text read better to people; it does not make AI text undetectable, and we didn't add tricks to try.

**Round 1 reading:**
- GPTZero, rated among the most accurate detectors, called every text 100% AI with "high confidence", rewrites included.
- Sapling dropped a little on three rewrites (email, product, cover letter) and swung wildly on one (blog), while the LinkedIn rewrite went up.
- This matches what our research found for other humanizer skills: a style rewrite by a language model fools human readers more than it fools strong detectors.
