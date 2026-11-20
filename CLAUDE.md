@AGENTS.md

## Project skills and agents

The skills in `.claude/skills/` (`shape-work`, `design-solution`, `design-ux`, `create-issue`, `plan-change`, `split-plan`, `pick-up-issue`, `land-pr`, `visual-check`, `review-ui`, `review-docs`, `review-security`, `web-platform-guidance`, `playwright-tests`, `design-tests`, `review-tests`, `delete-first`, `release`) are the procedures behind `AGENTS.md`; load the one that matches the task before you start. The agents `implementer`, `fresh-eyes-reviewer`, `ui-verifier`, `ux-reviewer`, `test-reviewer`, `security-reviewer` and `lean-reviewer` in `.claude/agents/` run `sonnet`, and `architecture-reviewer` runs `opus`; each follows those skills. Use them for the tasks they name. Other tools read generated copies of the rest (see `docs/guides/working-with-agents.md`), so after editing a skill or agent run `npm run agents:sync`.

## Models

In Claude Code the tiers in `AGENTS.md` are `haiku` (small and fast), `sonnet` (default) and `opus` (most capable). Set the `model` parameter of an `Agent` call on purpose: leaving it out inherits the session's model.

`fable` is the model above them, so the rule in `AGENTS.md` on a model above the most capable tier applies to it: never start a `fable` agent or set `model: fable` without that authorisation. If you think a task needs it, say why and ask.

## Personal preferences

Claude Code also reads `CLAUDE.local.md` (git-ignored) for your own working style. `docs/guides/personal-preferences.md` explains it.

## Editing the instruction files

This file and `AGENTS.md` load into every session, so each line costs context and a long or contradictory file is followed less reliably. Keep each under about 200 lines, state rules as specific, checkable instructions, and put procedures that matter for one task in a skill and material for one area of the code in the document that owns it (`ARCHITECTURE.md`, `DESIGN.md`, `docs/guides/`), with a pointer from `AGENTS.md`. Do not import long documents with `@`: an import loads the whole file every session. Rules that must hold every time belong in a hook or in the lint, not only in prose. When a rule changes, change it in one place and remove the old wording; run `/doctor prompt-audit` now and then to find stale or conflicting lines.
