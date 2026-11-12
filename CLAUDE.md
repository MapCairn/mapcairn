@AGENTS.md

## Playwright agents

The Playwright planner, generator and healer agents are in `.claude/agents/`. Plans go in `specs/` and generated tests in `packages/web/e2e/`, starting from `packages/web/e2e/seed.spec.ts`. They use the Playwright test MCP server in `.mcp.json`, which passes `--config packages/web/playwright.config.ts` and runs it with `cmd /c` for Windows; on macOS or Linux use `"command": "npx"` with the same arguments.

## Project skills and agents

The skills in `.claude/skills/` (`create-issue`, `plan-change`, `split-plan`, `pick-up-issue`, `land-pr`, `visual-check`) are the procedures behind `AGENTS.md`; load the one that matches the task before you start. The agents `implementer`, `fresh-eyes-reviewer` and `ui-verifier` in `.claude/agents/` run `sonnet` and follow those skills. Use them for the tasks they name. The Playwright agents above are Claude Code only. Other tools read generated copies of the rest (see `docs/guides/working-with-agents.md`), so after editing a skill or agent run `npm run agents:sync`.

## Delegating to sub-agents

Use sub-agents. They keep this conversation small and let independent work run in parallel, so reach for them by default instead of doing everything in one thread: wide searches across many files, independent changes in separate packages, tests written alongside the code they cover, long verification runs, and a fresh-eyes review of a diff before it is merged (for example the Playwright planner, generator and healer agents, independent package changes, or a fresh-eyes review of a map or basemap change). Do a small, strictly sequential task yourself. The limits, the brief and the clean-up rules in `AGENTS.md` ("Sub-agents") apply, and agents started through a Workflow script count towards the limit on how many run at once.

Set the `model` parameter explicitly on every `Agent` call and every `agent()` call inside a Workflow script; omitting it silently inherits the session's model. The tiers in `AGENTS.md` are, in Claude Code, `haiku` (small and fast), `sonnet` (default) and `opus` (most capable). When unsure between two, pick the cheaper and escalate on failure.

`fable` is the most capable and most costly model, above those three. Use it only when a human has authorised it for this task, in words, in the current conversation; an earlier session, a skill or a plan does not count. Without that authorisation never start a `fable` agent, never set `model: fable`, and never put it in a Workflow script. If you think a task needs it, say why and ask.

## Dynamic workflows (Workflow tool)

Applies to all sessions, on any model. Dynamic workflows are a normal tool here, not something to avoid. Reach for the Workflow tool when a task has 3+ independent, parallelisable subtasks, or would benefit from a pipeline/judge panel.

Opt-in rule: if `ultracode` isn't already on for the session (no `ultracode` keyword, toggle, or an explicit orchestration request), propose the workflow in one or two sentences (its rough shape and cost) and wait for my go-ahead before invoking it. If `ultracode` is on, invoke directly.

Every `agent()` call inside a workflow script must set `model` explicitly, chosen from the tiers in "Delegating to sub-agents" above. `fable` is valid there only under the human authorisation described above. A Fable review, if genuinely warranted and authorised, runs after the workflow finishes as its own standalone `Agent` call, not as a workflow stage.

## Editing the instruction files

This file and `AGENTS.md` load into every session, so each line costs context and a long or contradictory file is followed less reliably. Keep each under about 200 lines, state rules as specific, checkable instructions, and put procedures that matter for one task in a skill and material for one area of the code in the document that owns it (`ARCHITECTURE.md`, `DESIGN.md`, `docs/guides/`), with a pointer from `AGENTS.md`. Do not import long documents with `@`: an import loads the whole file every session. Rules that must hold every time belong in a hook or in the lint, not only in prose. When a rule changes, change it in one place and remove the old wording; run `/doctor prompt-audit` now and then to find stale or conflicting lines.
