# Blind test protocol

**Question:** after deClaude, can classmates still tell the text was written by AI?

**Rule:** every response in this folder must come from a real classmate. Don't fill in, estimate or simulate missing answers. If fewer people respond than planned, report the real number.

## Design

The brief says "guess which versions were AI-written". Both the original and the rewrite come from AI, so on its own a "which is AI?" question has no right answer. We add a **human baseline**: teammates write their own version of each of the five pieces, from the same prompt, without using AI. That lets us compare how often each version gets called "AI".

Three versions of each of the five content types:

| Code | Version | Source |
|---|---|---|
| O | Original Claude output | `docs/test-report/samples-original.md` |
| R | deClaude rewrite | `docs/test-report/results.md` (after running `scripts/run-tests.js`) |
| H | Human-written control | `human-controls.md` (teammates write these, no AI help) |

**Two forms, so nobody sees the same piece twice.** If a classmate reads both the original and the rewrite of the same email, they can just compare them. So:

| | Email | Blog | Product | LinkedIn | Cover letter |
|---|---|---|---|---|---|
| **Form A** | O | R | O | R | O |
| **Form B** | R | O | R | O | R |

Both forms also include all five H pieces. Each person reads 10 short pieces in random order (the script shuffles them) and answers, for each one:

1. *Was this written by a person or by AI?* (Person / AI)
2. *How sure are you?* (1 = guessing, 5 = certain)
3. *Optional: what gave it away?* (free text, which tells us which patterns people actually notice)

**Who:** at least 5 classmates per form (10+ total) if you can. The brief's minimum is 5 people in total, which still works but gives wide error bars. Assign people to forms alternately (first person A, second B, and so on).

**Don't tell them** which pieces are human, how many are AI, or what the project is about until they have submitted.

## Making the forms

1. Write the five human controls in `human-controls.md`. Keep each close in length to the Claude original, and don't look at the Claude versions while writing.
2. Run the app on the five samples: `node scripts/run-tests.js <app-url>`.
3. Run `node scripts/build-blind-test.js`. It writes `form-A.md`, `form-B.md` (pieces in shuffled order, labelled only "Piece 1" to "Piece 10") and `answer-key.csv`.
4. Copy each form into a Google Form, with one section per piece and the three questions above. Turn off email collection; you only need a first name or initials.
5. Export the responses as CSV into this folder as `responses-A.csv` and `responses-B.csv`.
6. Run `node scripts/analyze-blind-test.js` to produce `results.md`.

## What we report

- Share of pieces called "AI", for each version (O, R, H), with the number of judgments behind each figure.
- The same split by content type.
- Average confidence for each version.
- The most common "what gave it away" reasons, grouped by our pattern IDs where they match.
- Limits: small sample, classmates who know the course topic, short pieces.

**What counts as success:** the rewrites (R) get called "AI" noticeably less often than the originals (O), and close to the human controls (H). If they aren't, report that honestly. A null result, written up well, is still a valid finding.
