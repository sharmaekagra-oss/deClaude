# AI writing patterns: the deClaude catalogue

24 patterns that make text read as AI-written, grouped into five families. Each has an ID. The same IDs are used in `skill/SKILL.md`, in the app's detectors (`app/detectors.js`), and in the change annotations the app shows. That keeps the research, the skill and the app in step.

**How the list was built.** We read the 21 most-starred and most-forked de-AI repos on GitHub (notes in [repo_notes.md](repo_notes.md)) and the Wikipedia field guide they mostly draw on, [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). A pattern made the list if at least two independent sources named it, or if the brief asked for it by name.

**Detection column.** *Rule* means a regex in `app/detectors.js` flags it before and after rewriting. *Stat* means a measurement (sentence lengths, opener repetition). *Judgment* means only the rewrite model can spot it, so it lives in SKILL.md alone.

**Source key.** W = Wikipedia Signs of AI writing · BH = blader/humanizer (56k stars) · SS = hardikpandya/stop-slop (18k) · NS = petergyang/no-ai-slop (12k) · AW = conorbronsdon/avoid-ai-writing (5k) · SM = ItsssssJack/SlopMonster · CU = theclaymethod/unslop · Brief = named in the project brief.

## A. Punctuation and formatting

| # | ID | Pattern | Example | Detection | Sources |
|---|---|---|---|---|---|
| 1 | `em-dash` | Em dashes, en dashes and ` -- ` used as all-purpose connectors | "The tool is fast — and it's free." | Rule | Brief, W (now listed as a historical sign, 2022 to Sept 2026), BH §8, SS, AW, CU |
| 2 | `bold-labels` | Bold used as decoration, especially `**Label:** text` lists | "**Speed:** It's fast. **Price:** It's cheap." | Rule | W, BH §19, AW #32, CU |
| 3 | `heading-style` | Decorative headings and markup: Title Case headings (including whole bold lines used as headings), emoji or arrows, a heading every two paragraphs, hashtag stuffing | "## 🚀 Key Benefits For Your Team", "#MBA #Learning #Growth #Grateful" | Rule | W, BH §20, AW #14, #34, #63 |

## B. Word choice

| # | ID | Pattern | Example | Detection | Sources |
|---|---|---|---|---|---|
| 4 | `ai-vocab` | Words models overuse: delve, tapestry, testament, pivotal, robust, seamless, leverage, landscape, realm, foster, underscore, showcase, meticulous, intricate | "Let's delve into the rich tapestry of..." | Rule | W ("AI vocabulary" list), BH §12, NS, AW Tier 1, SM |
| 5 | `stacked-adjectives` | Two or more stock adjectives piled on one noun | "a sleek, intuitive, powerful dashboard" | Rule | Brief, BH §9 and §10, SM (hyphen stacks) |
| 6 | `intensifiers` | Empty adverbs: truly, really, deeply, genuinely, incredibly, absolutely, simply, actually | "We are truly excited to genuinely help" | Rule | SS, NS, AW #2, CU §7 |
| 7 | `copula-avoidance` | "Serves as", "stands as", "boasts", "features" in place of plain is/has | "The library serves as a hub" → "The library is a hub" | Rule | W, BH §18, AW #16, CU §14 |
| 8 | `promo-language` | Brochure words: nestled, in the heart of, breathtaking, world-class, game-changer, elevate, unlock | "Nestled in the heart of the city" | Rule | W, BH §16, AW #28, CU §11 |
| 9 | `hedge-stack` | Two hedges where one would do | "could potentially", "may possibly help" | Rule | AW #10, SM, CU |

## C. Sentence templates

| # | ID | Pattern | Example | Detection | Sources |
|---|---|---|---|---|---|
| 10 | `rule-of-three` | Reflexive groups of three, often with rising rhythm | "fast, simple, and reliable" | Rule | Brief, W, BH §6, SS, AW, SM |
| 11 | `not-x-but-y` | Negative parallelism and fake contrast | "It's not just a tool, it's a movement." | Rule | W, BH §1, SS, NS, AW #2, CU §16 |
| 12 | `stock-openers` | Throat-clearing and filler openers | "In today's fast-paced world", "Here's the thing:", "Let's dive in", "When it comes to" | Rule | Brief, SS, NS, AW #5 and #21, CU §1 and §4 |
| 13 | `template-phrases` | Ready-made ad and blog templates | "Whether you're a beginner or a pro", "more than just", "say goodbye to", "look no further", "that's where X comes in" | Rule | AW #4, SM |
| 14 | `transition-overuse` | Moreover, Furthermore, Additionally starting sentence after sentence | "Furthermore, ... Additionally, ..." | Rule | W, AW #5, CU structure scan |
| 15 | `ing-tail` | A sentence ending on an empty -ing clause that claims significance | "..., highlighting the importance of teamwork." | Rule | W, BH §15, AW #27, CU §12 |
| 16 | `self-answer` | A question the writer answers right away, or a colon reveal | "The result? A faster team." "The best part: it learns." | Rule | NS, SS, SM, CU §23 |

## D. Claims and tone

| # | ID | Pattern | Example | Detection | Sources |
|---|---|---|---|---|---|
| 17 | `significance-inflation` | Inflating ordinary things into milestones and legacies | "a pivotal moment", "a testament to", "plays a crucial role" | Rule | W, BH §13, AW #7, CU §10 |
| 18 | `vague-attribution` | Unnamed authorities | "Experts say", "Studies show", "Many believe" | Rule | W, BH §17, AW #20, CU §13 |
| 19 | `chatbot-residue` | Assistant chatter left in the text | "Great question!", "I hope this helps", "Feel free to reach out", "I'd be happy to" | Rule | W, BH §22, AW #23, CU §17 |
| 20 | `generic-closer` | Summary endings and vague optimism | "In conclusion", "Ultimately,", "The future looks bright", "Only time will tell" | Rule | W, BH §13, NS, AW #22, CU §28 and §29 |
| 21 | `punchy-closer` | A one-line moral or dramatic fragment at the end of a paragraph | "Let that sink in." "And that changes everything." | Rule (common forms) + Judgment | BH §2, SS, NS ("fake-profound kickers"), CU §2 |

## E. Rhythm and structure

| # | ID | Pattern | Example | Detection | Sources |
|---|---|---|---|---|---|
| 22 | `uniform-rhythm` | Sentences all about the same length, so the text has a steady machine beat | Ten sentences of 14 to 18 words each | Stat (coefficient of variation of sentence length below 0.45 over 6+ sentences) | BH (the third-party blind test found rhythm tells survived rewriting), SS #6, AW #73, CU burstiness |
| 23 | `repeated-openers` | Several sentences in a row starting the same way | "This tool... This means... This allows..." | Stat | BH §7, AW #69, CU opener repetition |
| 24 | `generic-filler` | Sentences that could move unchanged to any other company or topic, and say nothing specific | "Communication is key to any successful team." | Judgment | NS (the "portability test"), SS #4, AW #76 |

## What current Claude output actually looks like

We generated our five test pieces with plain prompts and no hint about the project (see `docs/test-report/samples-original.md`). The famous word-level tells barely appear: no "delve", no "tapestry", one em dash in five pieces. What shows up instead is structural:

- Bold lead-in sentences used as section labels ("**Fear of losing control.** New managers often...")
- "X, not Y" and "no longer X. It's Y" contrasts
- Groups of three in almost every paragraph
- Template phrases in cover letters ("sits at the intersection of", "I'd love the chance")
- Engagement-bait endings and hashtag rows on LinkedIn

So the detectors for `bold-labels`, `not-x-but-y`, `template-phrases`, `generic-closer` and `heading-style` were widened to catch these forms. This fits the shift Wikipedia records in its "historical indicators" section, where once-reliable signs such as em-dash overuse stop being reliable as models change.

## Rules for the rewrite, from what went wrong in other repos

These are not patterns to detect. They are mistakes the popular tools made, so SKILL.md forbids them.

1. **Don't invent facts.** SlopMonster's and academic-humanizer's own examples add details that were not in the source. theclaymethod/unslop's example adds a made-up "2015 startup" story. Our rewrite may cut, but it may not add facts, numbers, names or quotes.
2. **Don't swap one tell for another.** In an outside blind test of blader/humanizer, rewrites lost their AI vocabulary but gained staccato fragments and aphoristic closers ("uniform beat rate" went from 60 to 101). Short dramatic fragments are a tell too.
3. **Follow our own rules in the examples.** stop-slop's sample output contains the em dash it bans. Every example in our SKILL.md is checked with the same detectors the app uses.
4. **Don't treat one sighting as proof.** Wikipedia's "Ineffective indicators" section warns that perfect grammar, formal register or a single transition word prove nothing. Weak patterns need company before they're worth changing.

## What we left out, and why

- **Synonym cycling / elegant variation.** Wikipedia moved it to "historical indicators", and blader/humanizer dropped it in v3.0.0.
- **Curly quotes.** Every tool marks it as weak, and word processors produce them anyway.
- **Knowledge-cutoff disclaimers and placeholder leaks** (`[Your Name]`, `citeturn0search0`). Real tells, but rare in the content types we test. `chatbot-residue` covers the common ones.
- **Detector-evasion tricks** (Unicode spacing, homoglyphs). Out of scope: the brief is about human readers, and these tricks don't improve the writing.
