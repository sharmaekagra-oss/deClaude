# Working together

## Workflow

1. Pull the latest `main` before starting: `git pull`
2. Make a branch for your piece of work: `git checkout -b <your-name>/<task>` (e.g. `riya/blind-test-form`)
3. Commit small and often with clear messages.
4. Push and open a Pull Request into `main`. One teammate reviews before merging.
5. Vercel builds a preview link for every PR, so reviewers can try the app before it goes live.

`main` is what the live app link serves. Don't push to it directly.

## Ownership

Put your name next to a task in the README table before you start it, so two people don't do the same work.

## Rules that protect the grade

- **Never commit the API key.** It goes in `.env.local` (ignored by git) and in Vercel's environment variables. If a key is ever committed, tell the team and rotate it in the Anthropic Console straight away.
- **Blind-test data must be real.** Only record actual classmate responses in `docs/blind-test/`. Never fill gaps with made-up answers.
- **Log your AI use.** If you used an AI tool or a notable prompt for your part, add a line to `docs/ai-log.md`. The brief requires this log.
- **SKILL.md is the source of truth.** If you change a rewrite rule, change it in `skill/SKILL.md`. The app reads its rules from there.

## Style for anything we write

Follow our own rules: no em dashes, no stock AI phrases. We're graded on this.
