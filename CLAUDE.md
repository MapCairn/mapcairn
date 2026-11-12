@AGENTS.md

## Playwright agents

The Playwright planner, generator and healer agents are in `.claude/agents/`. Plans go in `specs/` and generated tests in `packages/web/e2e/`, starting from `packages/web/e2e/seed.spec.ts`. They use the Playwright test MCP server in `.mcp.json`, which passes `--config packages/web/playwright.config.ts` and runs it with `cmd /c` for Windows; on macOS or Linux use `"command": "npx"` with the same arguments.

## Delegating to sub-agents

Use sub-agents. They keep this conversation small and let independent work run in parallel, so reach for them by default instead of doing everything in one thread: wide searches across many files, independent changes in separate packages, tests written alongside the code they cover, long verification runs, and a fresh-eyes review of a diff before it is merged (for example the Playwright planner, generator and healer agents, independent package changes, or a fresh-eyes review of a map or basemap change). Do a small, strictly sequential task yourself. Brief each agent like a colleague who has not seen this conversation: the goal, the files or docs to read (name the sections of `ARCHITECTURE.md` and `DESIGN.md` that apply, from "Read before you change" in `AGENTS.md`), what is already ruled out, and what to report back.

Hard limits on sub-agents, which the owner set because many agents at once make their machine too slow to talk to Claude:

- Run at most two sub-agents at the same time, and prefer one. Never start a third while two are running; queue the work instead. This counts agents started through a Workflow script too.
- Do not stop a sub-agent that is already running just to get under the limit, because that wastes its work. Stopping one that is stuck, hung, redundant or no longer needed is fine.
- Every agent must clean up after itself: stop each dev server, wrangler instance, browser and other process it starts, and confirm with a port or process check that none is left running before it reports. Put this in every brief. Whoever delegated checks again when the agent finishes and stops anything left behind.
- While agents are running, prefer targeted checks over full local suites (CI runs the full suite on `main`), and use a different port for each e2e or dev server.

Model tiers for any delegated work, covering both `Agent` tool calls and `agent()` calls inside a Workflow script. Set the `model` parameter explicitly on every call; never omit it, since omission silently inherits the session's model.

| Tier | Use for |
| --- | --- |
| `haiku` | Mechanical bulk work: renames, boilerplate, format conversion, log triage |
| `sonnet` | Default for well-specified implementation with clear acceptance criteria |
| `opus` | Genuinely tricky work: concurrency, subtle algorithms, adversarial verify/judge panels, gnarly debugging |

**Never use `fable` sub-agents, under any circumstance, not even with my approval.** Stick to the three tiers above; when unsure between them, pick the cheaper one and escalate on failure.

## Dynamic workflows (Workflow tool)

Applies to all sessions, on any model. Dynamic workflows are a normal tool here, not something to avoid. Reach for the Workflow tool when a task has 3+ independent, parallelisable subtasks, or would benefit from a pipeline/judge panel.

Opt-in rule: if `ultracode` isn't already on for the session (no `ultracode` keyword, toggle, or an explicit orchestration request), propose the workflow in one or two sentences (its rough shape and cost) and wait for my go-ahead before invoking it. If `ultracode` is on, invoke directly.

Every `agent()` call inside a workflow script must set `model` explicitly, chosen from the tiers in "Delegating to sub-agents" above. `fable` is never valid there either. A Fable review, if genuinely warranted, runs after the workflow finishes as its own standalone `Agent` call (ask first, per above), never as a workflow stage.

## Editing the instruction files

This file and `AGENTS.md` load into every session, so each line costs context and a long or contradictory file is followed less reliably. Keep each under about 200 lines, state rules as specific, checkable instructions, and put procedures that matter for one task in a skill and material for one area of the code in the document that owns it (`ARCHITECTURE.md`, `DESIGN.md`, `docs/guides/`), with a pointer from `AGENTS.md`. Do not import long documents with `@`: an import loads the whole file every session. Rules that must hold every time belong in a hook or in the lint, not only in prose. When a rule changes, change it in one place and remove the old wording; run `/doctor prompt-audit` now and then to find stale or conflicting lines.
