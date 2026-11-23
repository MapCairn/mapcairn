# Personal preferences for coding agents

[`AGENTS.md`](../../AGENTS.md) holds the rules every contributor and every coding agent follows: the licence, privacy and security rules, the checks, the boundaries and the limits on sub-agents. It does not hold how you like to work. Whether an agent delegates by default, which models it prefers, how terse it is and which tools it reaches for are your choice, so they live in a file only you read.

## What goes where

| Belongs in `AGENTS.md` (shared)                                         | Belongs in your own file (personal)                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Tests first, the checks to run, the 3-day rule for packages             | How much to delegate to sub-agents, and when to ask before doing so  |
| Clean-up after sub-agents: ports, servers and processes                 | How many sub-agents run at once, and which model or tier for a task  |
| Merge only with the person's own authorisation                          | Opt-in rules for a tool feature, such as a workflow or planning mode |
| No assistant attribution, no maintainer name, a plain neutral voice     | Tone, length of replies, the language you chat in                    |
| A model above the most capable tier only when a human has authorised it | Your editor, shell and terminal habits                               |

Your file can add to the rules, never relax one. A line in it cannot authorise a merge, an exception to "Ask the maintainer first" or a skipped check: those need your own words in the conversation, as `AGENTS.md` says.

## Claude Code

Create `CLAUDE.local.md` in the repository root. Claude Code reads it with `CLAUDE.md`, and `.gitignore` already excludes it, so it is never committed. For preferences that apply to every project, use your user-level file, `~/.claude/CLAUDE.md` (on Windows, `.claude\CLAUDE.md` in your user folder).

A git worktree is a separate folder and may not contain the ignored file. Claude Code looks for these files from the working folder upward, so a worktree under the main checkout (such as `.claude/worktrees/<name>`) may find the main checkout's file, and copying the file into it may load it twice. Neither was checked for this guide; if a preference does not load, or loads twice, keep it in your user-level file instead.

## Other tools

`AGENTS.local.md` is also git-ignored. As far as this guide knows (not checked against every tool), no tool loads it by itself. Either start a session with "read `AGENTS.local.md` first", or put the same text in the tool's own user-level instruction file. These paths were not checked for this guide, so confirm them in the tool's documentation:

| Tool           | User-level instructions (check the tool's documentation) |
| -------------- | -------------------------------------------------------- |
| Codex          | `~/.codex/AGENTS.md`                                     |
| opencode       | `~/.config/opencode/AGENTS.md`                           |
| GitHub Copilot | personal instructions in its settings                    |
| Other tools    | the tool's documentation for a global instruction file   |

## An example

Write plain, checkable lines. This file is a sample, not a recommendation.

```markdown
# My preferences

- Delegate wide searches and long verification runs to sub-agents; do a small sequential change yourself.
- Prefer the small tier for mechanical work and the default tier for everything else. Ask before using the most capable tier.
- Before starting a multi-agent workflow, describe its shape and cost in two sentences and wait for my go-ahead.
- Keep replies short. Lead with the result, then what you checked.
```

## Keep it private

The file stays on your machine. Do not put credentials, personal data or other people's names in it, and do not copy its wording into an issue, a pull request or a commit message as if it were a project decision.
