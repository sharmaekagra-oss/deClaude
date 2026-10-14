# Welcome to deClaude

Our MICA OpenProject (40 marks): an app and a SKILL.md that rewrite AI-written text so it reads like a person wrote it, and show exactly what changed and why.

- **Live app:** https://declaude-nine.vercel.app (ask Ekagra for the class passcode)
- **Repo:** https://github.com/sharmaekagra-oss/deClaude (ask Ekagra to add you as a collaborator)

## Where we are

Done:
- Research: 21 de-AI GitHub repos surveyed, 24 AI-writing patterns listed with sources
- `skill/SKILL.md`: hard rules, all 24 patterns with fixes, genre notes, before/after examples
- The app: paste text, get a rewrite in a few seconds, side-by-side highlights, a tell count before and after, and checks for lost facts
- Official test: 5 Claude-written pieces (email, blog post, product description, LinkedIn post, cover letter) rewritten and reviewed

Still to do, and this is where we need you:
1. **Write the human controls.** Each of us writes one or more of the five pieces ourselves, from the same prompt Claude got, with **no AI help at all**. File: `docs/blind-test/human-controls.md`. Don't read Claude's version first.
2. **Run the blind test.** Classmates read 10 short pieces and guess "person or AI". We need at least 5 real people; 10+ is better. Never fill in or guess missing answers.
3. **Write the test report** and the one-page AI tools log.

## Get set up (10 minutes)

1. Accept the GitHub invite, then:
   ```bash
   git clone https://github.com/sharmaekagra-oss/deClaude.git
   cd deClaude
   npm install
   npm test
   ```
2. To see the app without any API key: `npm run mock`, then open the address it prints.
3. To run it for real, copy `.env.example` to `.env.local` and add a free key (Groq: console.groq.com, or Gemini: aistudio.google.com). Never commit `.env.local` and never paste keys into chat.

## How we work

- Make a branch for your task (`yourname/task`), open a pull request into `main`, and get one teammate to review. Vercel gives every pull request its own preview link.
- Put your name next to a task in the README table before starting it.
- If you use an AI tool for your part, add a line to `docs/ai-log.md`.
- Our own writing follows our rules: no em dashes, no stock AI phrases.

## If you use Claude Code

Open the repo folder in Claude Code. It reads `CLAUDE.md` automatically, which has the full context: decisions already made, how the app works, the rules, and what's left. Start by asking it what's left to do.

## Key files

| What | Where |
|---|---|
| The 24 patterns | `docs/research/patterns.md` |
| The skill | `skill/SKILL.md` |
| Test results | `docs/test-report/results.md` |
| Blind-test plan | `docs/blind-test/PROTOCOL.md` |
| AI tools log | `docs/ai-log.md` |
