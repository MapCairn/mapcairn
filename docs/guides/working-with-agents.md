# Working with coding agents

MapCairn is built with Claude Code, and everyone is welcome to use the coding agent they prefer: Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor or another. The same guard rails apply to all of them, because they live in one place, [`AGENTS.md`](../../AGENTS.md). This guide says what each tool reads, how to start, what only works in Claude Code, and what has and has not been checked.

## One source for each thing

| Thing | Source (edit this) | Copies for other tools (generated, do not edit) |
| --- | --- | --- |
| Rules | `AGENTS.md` | `CLAUDE.md` imports it; `GEMINI.md` and `.github/copilot-instructions.md` are a few lines that point to it |
| Skills | `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/` |
| Agents | `.claude/agents/<name>.md` | `.opencode/agents/<name>.md`, `.codex/agents/<name>.toml`, `.github/agents/<name>.agent.md` |

After you change a skill or an agent, run `npm run agents:sync`. It copies files (never links, so it works on Windows) and removes stale ones in the four output folders only. `npm run agents:check` does the same comparison without writing; `npm run lint` and the pre-commit hook run it, so stale copies cannot merge.

`agents:check` also holds every skill to the rules that make it work in more than one tool:

- `name` equals the folder name and is lowercase kebab-case, at most 64 characters.
- `description` is present and at most 1024 characters.
- Frontmatter is one `key: value` per line, and a plain value does not contain `: ` or ` #`. Claude Code accepts that, but a strict YAML reader does not, and other tools may skip the skill without saying so. Wrap such a value in double quotes.
- The body names no tool or feature that only one tool has (the list is `CLAUDE_ONLY_TOOL_NAMES` in `scripts/agents/skills.mjs`). Write "run the visual check" and let each tool use its own browser or shell.

An agent file is a short role: a name, a description and the text of the role, which points to a skill for the procedure. The generated files carry only those three things. They leave out Claude's tool list and model, which mean nothing to the other tools (some reject an unknown tool name), so those tools use their own defaults. The role text states the limits (for example the reviewer does not edit) as instructions, which Claude Code also does, because a tool list cannot hold them for a shell. The three Playwright test agents (`playwright-test-planner`, `-generator`, `-healer`) call Claude Code's Playwright MCP tools and are not generated.

## What each tool reads

Checked on 2026-11-12 against each tool's own documentation. The pages were read through a summarising web reader; the tools themselves were not run, except Claude Code (2.1.322). None of the tools' versions is stated in its documentation, apart from Claude Code needing 2.1.277 or later to read `AGENTS.md` on its own. A blank means the documentation did not say.

| | Instructions | Skills | Agents |
| --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` (here it imports `AGENTS.md`). Reads `AGENTS.md` alone only when there is no `CLAUDE.md` | `.claude/skills`. Does not read `.agents/skills` | `.claude/agents/*.md` |
| Codex | `AGENTS.md` | `.agents/skills`; `.claude/skills` not mentioned | `.codex/agents/*.toml` with `name`, `description`, `developer_instructions` |
| opencode | `AGENTS.md` only in the current (V2) docs; the older V1 docs fell back to `CLAUDE.md` | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `.opencode/agents/*.md`, with `mode: subagent` |
| GitHub Copilot | `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` (GitHub docs). In VS Code the file depends on the harness chosen | `.github/skills`, `.claude/skills`, `.agents/skills` (GitHub docs). VS Code lists the folder per harness | `.github/agents/*.agent.md` (public preview) |
| Antigravity | `AGENTS.md` or `GEMINI.md`, also inside `.agents/`, and `.agents/rules/*.md` | `.agents/skills` (the older `.agent/skills` still works) | `.agents/agents/<name>.md`, with tool names of its own; not generated, see below |
| Cursor | `AGENTS.md`, and `.cursor/rules/*.mdc`. `CLAUDE.md` not mentioned | `.agents/skills`, `.cursor/skills`, and `.claude/skills` and `.codex/skills` for compatibility | `.cursor/agents`, `.claude/agents` and `.codex/agents` |

Gemini CLI, a separate tool, loads `GEMINI.md` by default and other names only when `context.fileName` lists them. `GEMINI.md` here is for it.

What this means in practice:

- `AGENTS.md` reaches every tool above without a copy. `GEMINI.md` and `.github/copilot-instructions.md` exist for the tools or surfaces that read only their own file. They hold no rule, so no rule is written twice.
- Skills: Claude Code reads the source, Codex and Antigravity read the `.agents/skills` copy, and opencode, Copilot and Cursor read either.
- Agents: Claude Code and Cursor read the source. The generated files cover opencode, Codex and Copilot. Antigravity's agent format was read, but its documentation says a tool list left empty means no tools and a misspelt tool name can hang the agent, and its tool names were not verified here, so no file is generated for it. It still works by loading the skills. Whether Cursor reads a `.toml` file in `.codex/agents` is not stated.
- A tool that has skills but no agents, or the reverse, still works: tell the agent which skill to follow.

## How to start

Tell the agent the issue and the skill, in your own words. For example:

- "Pick up issue 123 and follow the `pick-up-issue` skill."
- "Open the pull request and follow the `land-pr` skill. Do not merge."
- "Review pull request 130 with the `fresh-eyes-reviewer` role."
- "Look at the running app and follow the `visual-check` skill."

Where the tool has agent support, name the agent (`implementer`, `fresh-eyes-reviewer` or `ui-verifier`) instead. Where it does not read the skill folder on its own, point it at `.agents/skills/<name>/SKILL.md`.

Whichever tool you use, the rules do not change: failing test first, no dependency released in the last 7 days, no assistant attribution, a neutral voice on GitHub, and a merge only when a human has authorised it in their own words for that pull request.

## Sub-agents and models

`AGENTS.md` ("Sub-agents") holds the limits. The model tiers are by role, so they apply in any tool:

| Tier | Pick it when | Examples |
| --- | --- | --- |
| Small and fast | The work is mechanical and the result is easy to check: no design judgement and little context needed | Renames, boilerplate, format conversion, log triage, listing or counting, filling in a template |
| Default | The task is well specified, with clear acceptance criteria and a test that shows it is done | Implementing an issue, tests beside the code, a documentation change, a refactor along known seams, a fresh-eyes review of a diff |
| Most capable | The work is hard to get right and a wrong answer is costly or hard to see: judgement across many files, or reasoning that must survive an attack | Concurrency, subtle algorithms, adversarial verify or judge panels, gnarly debugging after the default tier has failed, a design that decides a public API |

When unsure between two tiers, take the cheaper and escalate on failure. In Claude Code the three are `haiku`, `sonnet` and `opus`, set on every agent call; the generated agent files for other tools set no model, so the tool's own default applies unless you choose one.

## Only in Claude Code

- The Playwright test planner, generator and healer agents, and the Playwright MCP server in `.mcp.json`.
- The Workflow tool and its opt-in rule, and the `fable` model rule, in `CLAUDE.md`.
- Permission and hook settings in `.claude/settings.json`. Another tool has its own; none of the guard rails depends only on them, because each is also written in `AGENTS.md`.

## What has not been checked

- No skill has been run end to end in another tool. Codex, opencode, Cursor, Antigravity and Copilot's command line were not installed where this was written, and Copilot in VS Code (1.146.0) was not exercised. If you try one, say what broke in a pull request or an issue.
- The generated TOML and YAML were not parsed by the tools' own readers. Skill frontmatter is held to the strict rule above, and the agent files are built from JSON-quoted strings, which both formats read.
- Documentation changes often. A path that stops working is a reason to open an issue, with the tool, its version and the page that says otherwise.
