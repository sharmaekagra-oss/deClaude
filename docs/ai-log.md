# AI tools and key prompts log

One page max in the final submission. Add entries as you go and trim at the end.

| Date | Who | Tool | What it was used for | Key prompt (short) |
|---|---|---|---|---|
| 2026-10-13 | Ekagra | Claude Code (Opus 5.5) | Defined app parameters from the brief; surveyed top GitHub de-AI/humanizer repos; set up this repo | "Look at top github repos for de-Clauding and de-AI apps... before any synthesis, clearly define and confirm the parameters of the app" |
| 2026-10-13 | Ekagra | Claude Code subagent (Opus 5.5) | Read 21 repos (README, prompts, pattern files, issues) and wrote factual notes | "Find and read the most-starred and most-forked GitHub repositories that de-AI / humanize / de-slop AI text... collect factual per-repo notes only" |
| 2026-10-13 | Ekagra | Claude Code (Opus 5.5) | Built the 24-pattern list, SKILL.md, detectors, app and test scripts | "We'll figure out access later, let's build" |
| 2026-10-13 | Ekagra | Claude Code subagent (Opus 5.5) | Generated the five test pieces in Claude's default style | "Write five short pieces... exactly as you normally would... Do not try to sound more or less human" (full prompts in samples-original.md) |
| (runtime) | App | Claude API, `claude-opus-5-5` | Does each rewrite inside the app | System prompt = `skill/SKILL.md` + JSON output instructions in `api/rewrite.js` |
