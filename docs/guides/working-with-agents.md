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

`ui-verifier` has no browser tools of its own in its source: the `visual-check` skill uses the Playwright command line, or browser tools where the tool offers them. Writing and healing Playwright tests is the `playwright-tests` skill, not an agent, so every tool gets it from the skill copy (see "Playwright tests" below).

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
- "Write the Playwright tests for issue 123 and follow the `playwright-tests` skill."

Where the tool has agent support, name the agent (`implementer`, `fresh-eyes-reviewer` or `ui-verifier`) instead. Where it does not read the skill folder on its own, point it at `.agents/skills/<name>/SKILL.md`. The rules, including the limits on sub-agents and the model tiers by role, are in `AGENTS.md`. In Claude Code the tiers are named in `CLAUDE.md`; the generated agent files set no model.

When you start an agent, copy the brief block from `pick-up-issue` ("Briefing an agent") so it carries the checks, the clean-up and the report. For a free or smaller model, which follows a brief literally and fills a gap with plausible text, also fill in the block's `Wording:`, `Claims:` and `Before you open:` lines. An agent that another agent started does not start sub-agents: it does the simplify step and the review checklist inline, and its caller runs the independent review. Full local `e2e` and `a11y` runs are for layout, engine and test-seam changes; for the rest the agent runs the specs that cover its change and CI runs the full suites.

## Only in Claude Code

- The Workflow tool and its opt-in rule, and the `fable` model rule, in `CLAUDE.md`.
- Tool limits on agents (their `tools` lists). A person's own permission and hook settings are specific to the tool they use; no rule depends on one, because each is written in `AGENTS.md`.

## Playwright tests

The `playwright-tests` skill carries the MapCairn rules for planning, writing and healing the browser tests in `packages/web/e2e/`. It needs a shell and file access, and no MCP server, extension or image reader. The command-line procedure comes from the Playwright version in `package-lock.json`: the package `playwright-core` ships a skill at `node_modules/playwright-core/lib/tools/skills/playwright-cli/SKILL.md` (Apache-2.0), and `npx --no-install playwright cli` runs the commands it describes (the Playwright documentation says this needs Playwright 1.59 or newer; the repository has 1.65.0). The project skill points to that file, so no tool installs a package or copies a vendor skill, and the procedure always matches the installed version. The project had a Playwright test MCP server and three Claude Code agents (planner, generator, healer) for the same job. They were removed by the maintainer's decision, because the command line does the job for every tool and model. A model that cannot read images uses `snapshot` (the accessibility tree) instead of `screenshot`, and says in its report what it did not see.

How each tool reaches the skill (all of them can read `AGENTS.md` and a file path in the repository, so every tool can follow the skill even when it does not list it as a skill):

| Tool | Skill reached through | Instructions |
| --- | --- | --- |
| Claude Code | `.claude/skills/playwright-tests` | `CLAUDE.md`, which imports `AGENTS.md` |
| Codex | `.agents/skills/playwright-tests` | `AGENTS.md` |
| opencode | `.opencode/skills`, `.claude/skills` or `.agents/skills` | `AGENTS.md` |
| GitHub Copilot | `.claude/skills` or `.agents/skills` | `AGENTS.md`, `.github/copilot-instructions.md` |
| Antigravity | `.agents/skills/playwright-tests` | `AGENTS.md` or `GEMINI.md` |
| Cursor | `.agents/skills` or `.claude/skills` | `AGENTS.md` |

Other tools checked on 2026-11-13 against their own documentation, read as text; none was run. None needs a new file.

| Tool | What its documentation says | Source |
| --- | --- | --- |
| Windsurf | Reads `AGENTS.md` at the project root. Reads skills from `.agents/skills` as well as `.devin/skills` and `.windsurf/skills` | docs.windsurf.com (Customize, "AGENTS.md" and "Skill scopes") |
| Gemini CLI | Loads `GEMINI.md` by default (the one here points to `AGENTS.md`); `AGENTS.md` too when `context.fileName` lists it | geminicli.com/docs (GEMINI.md context) |
| Junie CLI | Reads `AGENTS.md` at the project root | junie.jetbrains.com/docs (guidelines and memory) |
| Cline | Reads `AGENTS.md` | docs.cline.bot (rules) |
| Roo Code | Reads `AGENTS.md` (or `AGENT.md`) in the workspace root | docs.roocode.com (custom instructions) |
| Kiro | Reads `AGENTS.md`, always included | kiro.dev/docs (steering) |
| Amp | Not verified: the manual page was fetched but its text on instructions was not read | ampcode.com/manual |
| Zed | Not verified: the rules page was not found | zed.dev/docs |

The skills folders of Cline, Roo Code, Kiro and Junie were not checked, so those tools follow the skill by path. The skill is written to be followed that way: open `.agents/skills/playwright-tests/SKILL.md`.

No MCP configuration for another tool is committed, because the skill does not use MCP. `.vscode/mcp.json` is an editor setting that configures a Playwright, a Chrome DevTools and a GitHub server; no skill or agent here uses them. `npx --no-install playwright cli` covers the Playwright one, and `gh` covers the GitHub one (the skills already use `gh`). Whether the command line covers what the Chrome DevTools server does was not checked.

## What has not been checked

- No skill has been run end to end in another tool. Codex, opencode, Cursor, Antigravity and Copilot's command line were not installed where this was written, and Copilot in VS Code (1.146.0) was not exercised. If you try one, say what broke in a pull request or an issue.
- Whether opencode, Copilot and Cursor deduplicate a skill present in both `.claude/skills` and `.agents/skills`.
- The generated TOML and YAML were not parsed by the tools' own readers. Skill frontmatter is held to the strict rule above, and the agent files are built from JSON-quoted strings, which both formats read.
- Documentation changes often. A path that stops working is a reason to open an issue, with the tool, its version and the page that says otherwise.
