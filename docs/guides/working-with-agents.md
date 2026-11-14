# Working with coding agents

The project's skills and agents were written for Claude Code, and everyone is welcome to use the coding agent they prefer: Claude Code, Codex, opencode, GitHub Copilot, Antigravity, Cursor, Qwen Code or another. The rules live in one place, [`AGENTS.md`](../../AGENTS.md), and apply whichever tool you use. What differs is how much a tool can enforce: a rule is written as an instruction everywhere, and Claude Code can also back some of them with settings. This guide says what each tool reads, how to start, what only works in Claude Code, and what has and has not been checked.

## One source for each thing

| Thing | Source (edit this) | Copies for other tools (generated, do not edit) |
| --- | --- | --- |
| Rules | `AGENTS.md` | `CLAUDE.md` imports it; `.github/copilot-instructions.md` is a few lines that point to it |
| Skills | `.claude/skills/<name>/SKILL.md`, project skills only | `.agents/skills/<name>/` |
| Agents | `.claude/agents/<name>.md` | `.agents/agents/<name>.md`, `.opencode/agents/<name>.md`, `.codex/agents/<name>.toml`, `.github/agents/<name>.agent.md`, `.qwen/agents/<name>.md` |

After you change a skill or an agent, run `npm run agents:sync`. It copies files (never links, so it works on Windows) and removes stale ones in the six output folders only. `npm run agents:check` does the same comparison without writing; `npm run lint` and the pre-commit hook run it, so stale copies cannot merge. The script takes the repository root from its own location, and fails in both modes when `.claude/skills` is missing or there is nothing to generate.

`agents:check` also holds every project skill to the rules that make it work in more than one tool:

- `name` equals the folder name and is lowercase kebab-case, at most 64 characters. A folder that is a symbolic link is reported, because the sync copies and never links.
- `description` is present and at most 1024 characters.
- Frontmatter is one `key: value` per line, and a plain value does not contain `: ` or ` #`. Claude Code accepts that, but a strict YAML reader does not, and other tools may skip the skill without saying so. Wrap such a value in double quotes.
- The body names no tool or feature that only one tool has (the list is `CLAUDE_ONLY_TOOL_NAMES` in `scripts/agents/skills.mjs`). Write "run the visual check" and let each tool use its own browser or shell. The same list is applied to the body of every agent that is generated.

### Skills installed from elsewhere

`skills-lock.json` records the skills installed from other sources (none today; the repository holds no Cloudflare skills or MCP servers, which are a personal choice installed at user level), with their source and a hash. They are not the project's text to rewrite, so `agents:sync` neither checks nor copies them, and the mirror holds the project's skills only. To add or update one, install it into `.claude/skills` the way the lock file records and commit the folder and its lock entry together; do not edit its files by hand, because the hash would no longer match. A tool that reads only `.agents/skills` (Codex, Antigravity) will not see it unless you install it there yourself, which is not tracked here.

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
| GitHub Copilot | `.github/copilot-instructions.md`, `AGENTS.md` or `CLAUDE.md` (GitHub docs). In VS Code the file depends on the harness chosen | `.github/skills`, `.claude/skills`, `.agents/skills` (GitHub docs). VS Code lists the folder per harness | `.github/agents/*.agent.md` (public preview) |
| Antigravity | `AGENTS.md` in the workspace and in each parent folder up to the repository root, also inside `.agents/`, and `.agents/rules/*.md` | `.agents/skills` (the older `.agent/skills` still works) | `.agents/agents/<name>.md`, with a `tools` list in tool names of its own; generated, see below |
| Cursor | `AGENTS.md`, and `.cursor/rules/*.mdc`. `CLAUDE.md` not mentioned | `.agents/skills`, `.cursor/skills`, and `.claude/skills` and `.codex/skills` for compatibility | `.cursor/agents`, `.claude/agents` and `.codex/agents` |
| Qwen Code (checked 2026-11-13) | `AGENTS.md` ("if your repository already has an `AGENTS.md` file for other AI tools, Qwen reads that too"), as well as its own `QWEN.md`. `CLAUDE.md` not mentioned | `.agents/skills` and `.qwen/skills` in the project (the `.qwen` copy wins on a name clash). `.claude/skills` is not read unless `skills.directories` in its settings lists it | `.qwen/agents/*.md`, with `name` and `description` and optional `model`, `tools` and `approvalMode` |

What this means in practice:

- `AGENTS.md` reaches every tool above without a copy. `.github/copilot-instructions.md` exists for the Copilot surfaces that read only that file. It holds no rule, so no rule is written twice.
- Skills: Claude Code reads the source and Codex, Antigravity and Qwen Code read the `.agents/skills` copy. opencode, Copilot and Cursor each read both `.claude/skills` and `.agents/skills`, so they see a project skill twice. Whether they deduplicate it is not checked.
- Agents: Claude Code and Cursor read the source. The generated files cover Antigravity, opencode, Codex, Copilot and Qwen Code (`.qwen/agents`, where Qwen Code's documentation says a Claude Code agent file can be dropped; the generated file has only `name`, `description` and the role text, so it inherits the session's model and tools). Antigravity reads `.agents/agents`, where the generated file has `name`, `description`, a `tools` list and the role text. Its documentation gives the `tools` list a default of none, so the list is always written, and it names only four tools (`view_file`, `replace_file_content`, `grep_search` and `run_command`), because a name it does not know is a documented cause of a hung agent. Each agent gets the ones that match the tools in its source (Read, Edit and Write, Grep, Bash), and Glob and Skill have no documented name, so `grep_search` and `run_command` find files and the skills come from `.agents/skills`. Unlike the other tools, the list is enforced: `fresh-eyes-reviewer` and `ui-verifier` get no edit tool, though a shell can still write. Antigravity's model and shell-command policy are left at its defaults, and the documentation says the default policy runs commands in a sandbox, which may limit what an agent can run; change it in Antigravity's own settings if a command is refused. Whether Cursor reads a `.toml` file in `.codex/agents` is not stated.
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

Most of the work here is done with Claude Code, and its models (haiku, sonnet, opus) can read images. Other tools and models vary: `visual-check` says how to check a model's image support and what to do when it cannot read images. For a free or smaller model, give it one or two small issues per prompt and tell it to work only in its own worktree.

Use the small tier (in Claude Code, haiku) where the work is mechanical and the result is easy to check: searching and listing, applying a fully specified edit across files, running a fixed check and summarising it, listing what a clean-up sweep would remove (the caller confirms the paths and deletes, as `land-pr` requires), formatting, ticking boxes and updating trackers, and reading a log for one answer. Do not use it for design decisions, anything that needs judgement about the codebase, reasoning about hostile input, or a review that must find what the author missed; those go above the small tier, as `AGENTS.md` says. Brief a small model with one task, the exact files, the exact change or the exact question, the format of the answer ("reply with only ..."), a stop condition and no open-ended exploring, and say which check the caller will run on the result. Include the rules it needs in the brief. When a small-tier brief fails, escalate to the default tier with a clearer brief instead of retrying the same one. The agent tells the caller which small-tier briefs worked and which failed, and the caller adds them to the improvements tracker, so this guidance improves.

When the project's `main` moves under an open pull request, merge it into the branch, resolve and push normally: the pull request is squash-merged, so the branch's history does not matter, and a force-push is avoided. When several open pull requests touch the same files, the caller merges the smallest and most widely shared change first and sends each remaining author the same instruction, one at a time.

## Only in Claude Code

- The Workflow tool and its opt-in rule, and the `fable` model rule, in `CLAUDE.md`.
- Tool limits on agents (their `tools` lists). A person's own permission and hook settings are specific to the tool they use; no rule depends on one, because each is written in `AGENTS.md`.

## Playwright tests

The `playwright-tests` skill carries the MapCairn rules for planning, writing and healing the browser tests in `packages/web/e2e/`. It needs a shell and file access, and no MCP server, extension or image reader.

The command-line procedure comes from the Playwright version in `package-lock.json`. The package `playwright-core` ships a skill at `node_modules/playwright-core/lib/tools/skills/playwright-cli/SKILL.md` (Apache-2.0), and `npx --no-install playwright cli` runs the commands it describes. The Playwright documentation says this needs Playwright 1.59 or newer; the repository has 1.65.0. The project skill points to that file, so no tool installs a package or copies a vendor skill, and the procedure matches the installed version.

A model that cannot read images uses `snapshot` (the accessibility tree) instead of `screenshot`, and says in its report what it did not see. After `attach <session>`, every later command takes `-s=<session>`, and the seed is walked with `step-over`: on 1.65.0, `resume` let the seed finish and close the browser.

How each tool reaches the skill (all of them can read `AGENTS.md` and a file path in the repository, so every tool can follow the skill even when it does not list it as a skill):

| Tool | Skill reached through | Instructions |
| --- | --- | --- |
| Claude Code | `.claude/skills/playwright-tests` | `CLAUDE.md`, which imports `AGENTS.md` |
| Codex | `.agents/skills/playwright-tests` | `AGENTS.md` |
| opencode | `.opencode/skills`, `.claude/skills` or `.agents/skills` | `AGENTS.md` |
| GitHub Copilot | `.claude/skills` or `.agents/skills` | `AGENTS.md`, `.github/copilot-instructions.md` |
| Antigravity | `.agents/skills/playwright-tests` | `AGENTS.md` |
| Cursor | `.agents/skills` or `.claude/skills` | `AGENTS.md` |
| Qwen Code | `.agents/skills/playwright-tests` | `AGENTS.md` |

Other tools checked on 2026-11-13 against their own documentation, read as text; none was run. None of them needs a new file.

| Tool | What its documentation says | Source |
| --- | --- | --- |
| Windsurf | Reads `AGENTS.md` at the project root. Reads skills from `.agents/skills` as well as `.devin/skills` and `.windsurf/skills` | docs.windsurf.com (Customize, "AGENTS.md" and "Skill scopes") |
| Cline | Reads `AGENTS.md` | docs.cline.bot (rules) |

Cline's skills folder was not checked, so it follows the skill by path. The skill is written to be followed that way: open `.agents/skills/playwright-tests/SKILL.md`.

No MCP configuration file is committed for any tool, because the skills do not use MCP. Playwright work runs through `npx --no-install playwright cli`, and GitHub work through `gh`, which the skills already use. No Chrome DevTools server is configured: the Playwright command line covers the browser checks this project uses, and CI runs Lighthouse.

## What has not been checked

- No skill has been run end to end in another tool. Codex, opencode, Cursor, Antigravity, Qwen Code and Copilot's command line were not installed where this was written, and Copilot in VS Code (1.146.0) was not exercised. If you try one, say what broke in a pull request or an issue.
- The Playwright command-line workflow was run only on Windows with Playwright 1.65.0 and only as far as attaching to the paused seed, stepping it and reading a `snapshot`. Planning, generating and healing a real spec through it, and `resume` followed by a command, were not tried (`resume` ends the seed run).
- Whether opencode, Copilot and Cursor deduplicate a skill present in both `.claude/skills` and `.agents/skills`.
- Qwen Code was read from its documentation, not run, so whether it loads the generated `.qwen/agents` files and the `.agents/skills` copy as described is not tried. Its documentation says a subagent without a `tools` list inherits all the parent's tools and that Skills need no switch, but it states no minimum version. Its own `QWEN.md` is not committed, because `AGENTS.md` reaches it already.
- The generated TOML and YAML were not parsed by the tools' own readers. Skill frontmatter is held to the strict rule above, and the agent files are built from JSON-quoted strings, which both formats read.
- Documentation changes often. A path that stops working is a reason to open an issue, with the tool, its version and the page that says otherwise.
