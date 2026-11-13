# Working with coding agents

The project's skills and agents were written for Claude Code, and everyone is welcome to use the coding agent they prefer: Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor or another. The rules live in one place, [`AGENTS.md`](../../AGENTS.md), and apply whichever tool you use. What differs is how much a tool can enforce: a rule is written as an instruction everywhere, and Claude Code can also back some of them with settings. This guide says what each tool reads, how to start, what only works in Claude Code, and what has and has not been checked.

## One source for each thing

| Thing | Source (edit this) | Copies for other tools (generated, do not edit) |
| --- | --- | --- |
| Rules | `AGENTS.md` | `CLAUDE.md` imports it; `GEMINI.md` and `.github/copilot-instructions.md` are a few lines that point to it |
| Skills | `.claude/skills/<name>/SKILL.md`, project skills only | `.agents/skills/<name>/` |
| Agents | `.claude/agents/<name>.md` | `.opencode/agents/<name>.md`, `.codex/agents/<name>.toml`, `.github/agents/<name>.agent.md` |

After you change a skill or an agent, run `npm run agents:sync`. It copies files (never links, so it works on Windows) and removes stale ones in the four output folders only. `npm run agents:check` does the same comparison without writing; `npm run lint` and the pre-commit hook run it, so stale copies cannot merge. The script takes the repository root from its own location, and fails in both modes when `.claude/skills` is missing or there is nothing to generate.

`agents:check` also holds every project skill to the rules that make it work in more than one tool:

- `name` equals the folder name and is lowercase kebab-case, at most 64 characters. A folder that is a symbolic link is reported, because the sync copies and never links.
- `description` is present and at most 1024 characters.
- Frontmatter is one `key: value` per line, and a plain value does not contain `: ` or ` #`. Claude Code accepts that, but a strict YAML reader does not, and other tools may skip the skill without saying so. Wrap such a value in double quotes.
- The body names no tool or feature that only one tool has (the list is `CLAUDE_ONLY_TOOL_NAMES` in `scripts/agents/skills.mjs`). Write "run the visual check" and let each tool use its own browser or shell. The same list is applied to the body of every agent that is generated.

### Skills installed from elsewhere

`skills-lock.json` records the skills installed from other sources (the Cloudflare ones), with their source and a hash. They are not the project's text to rewrite, so `agents:sync` neither checks nor copies them, and the mirror holds the project's skills only. To add or update one, install it into `.claude/skills` the way the lock file records and commit the folder and its lock entry together; do not edit its files by hand, because the hash would no longer match. A tool that reads only `.agents/skills` (Codex, Antigravity) will not see it unless you install it there yourself, which is not tracked here.

### Agents

An agent file is a short role: a name, a description and the text of the role, which points to a skill for the procedure. The generated files carry only those three things. They leave out Claude's tool list and model, which mean nothing to the other tools (some reject an unknown tool name), so those tools use their own defaults and the tiers in `AGENTS.md` are chosen by whoever starts the agent.

Tool limits, such as a list of allowed tools, are enforced only in Claude Code. In every other tool, and in the generated files, a limit like "the reviewer does not edit" rests on the instruction in the role text alone, and nothing technical stops a shell from writing. The reviewer's and the verifier's role texts say so, and all of them are worded as instructions ("Do not edit files"), not as facts about Claude's tools.

`ui-verifier` lists Claude Code's Playwright MCP tools in its source. The generated files omit them and the agent still works: the `visual-check` skill falls back to the Playwright command line and a short script. The three Playwright test agents (`playwright-test-planner`, `-generator`, `-healer`) depend on those tools and are named as Claude only in `scripts/agents/render.mjs`; they are not generated.

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
- Skills: Claude Code reads the source and Codex and Antigravity read the `.agents/skills` copy. opencode, Copilot and Cursor each read both `.claude/skills` and `.agents/skills`, so they see a project skill twice. Whether they deduplicate it is not checked.
- Agents: Claude Code and Cursor read the source. The generated files cover opencode, Codex and Copilot. Antigravity's agent format was read, but its documentation says a tool list left empty means no tools and a misspelt tool name can hang the agent, and its tool names were not verified here, so no file is generated for it. It still works by loading the skills. Whether Cursor reads a `.toml` file in `.codex/agents` is not stated.
- A tool that has skills but no agents, or the reverse, still works: tell the agent which skill to follow.

## How to start

Tell the agent the issue and the skill, in your own words. For example:

- "Pick up issue 123 and follow the `pick-up-issue` skill."
- "Open the pull request and follow the `land-pr` skill. Do not merge."
- "Review pull request 130 with the `fresh-eyes-reviewer` role."
- "Look at the running app and follow the `visual-check` skill."

Where the tool has agent support, name the agent (`implementer`, `fresh-eyes-reviewer` or `ui-verifier`) instead. Where it does not read the skill folder on its own, point it at `.agents/skills/<name>/SKILL.md`. The rules, including the limits on sub-agents and the model tiers by role, are in `AGENTS.md`. In Claude Code the tiers are named in `CLAUDE.md`; the generated agent files set no model.

When you start an agent, copy the brief block from `pick-up-issue` ("Briefing an agent") so it carries the checks, the clean-up and the report. For a free or smaller model, which follows a brief literally and fills a gap with plausible text, also fill in the block's `Wording:`, `Claims:` and `Before you open:` lines. An agent that another agent started does not start sub-agents: it does the simplify step and the review checklist inline, and its caller runs the independent review. Full local `e2e` and `a11y` runs are for layout, engine and test-seam changes; for the rest the agent runs the specs that cover its change and CI runs the full suites.

Most of the work here is done with Claude Code, and the Claude models used (haiku, sonnet, opus) can read images. Other tools and models vary, and one free model has been unable to, so check a model's image support before relying on it, with a one-line smoke test: ask it to describe a screenshot. An agent that cannot read images still runs the `e2e`, `a11y` and accessibility-tree checks, says under **Seen** that it did not look at the screen and why, and the caller starts a Claude agent such as `ui-verifier` for the visual check (`visual-check`). For a free or smaller model, give it one or two small issues per prompt and tell it to work only in its own worktree.

Tokens are finite, so use the small tier (in Claude Code, haiku) wherever the work is mechanical and the result is easy to check: searching and listing, applying a fully specified edit across files, running a fixed check and summarising it, clean-up sweeps, formatting, ticking boxes and updating trackers, and reading a log for one answer. Do not use it for design decisions, anything that needs judgement about the codebase, reasoning about hostile input, or a review that must find what the author missed; those go to the default tier or above, as the tiers in `AGENTS.md` say. Brief a small model with one task, the exact files, the exact change or the exact question, the format of the answer ("reply with only ..."), a stop condition and no open-ended exploring, and say which check the caller will run on the result. Give it the rules it needs in the brief; do not expect it to read `AGENTS.md`. When a small-tier brief fails, escalate to the default tier with a clearer brief instead of retrying the same one. Keep a short note of which small-tier briefs worked and which failed in the lessons list on #93, so this guidance improves.

When `main` moves under an open pull request, merge `origin/main`, resolve and push normally. Pull requests are squash-merged, and the permission system here refuses the force-push a rebase needs. When several open pull requests touch the same files, the caller merges the smallest and most widely shared change first and sends each remaining author the same instruction, one at a time.

## Only in Claude Code

- The Playwright test planner, generator and healer agents, and the Playwright MCP server in `.mcp.json`.
- The Workflow tool and its opt-in rule, and the `fable` model rule, in `CLAUDE.md`.
- Tool limits on agents (their `tools` lists). A person's own permission and hook settings are specific to the tool they use; no rule depends on one, because each is written in `AGENTS.md`.

## What has not been checked

- No skill has been run end to end in another tool. Codex, opencode, Cursor, Antigravity and Copilot's command line were not installed where this was written, and Copilot in VS Code (1.146.0) was not exercised. If you try one, say what broke in a pull request or an issue.
- Whether opencode, Copilot and Cursor deduplicate a skill present in both `.claude/skills` and `.agents/skills`.
- The generated TOML and YAML were not parsed by the tools' own readers. Skill frontmatter is held to the strict rule above, and the agent files are built from JSON-quoted strings, which both formats read.
- Documentation changes often. A path that stops working is a reason to open an issue, with the tool, its version and the page that says otherwise.
