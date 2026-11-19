# Personal preferences for coding agents

[`AGENTS.md`](../../AGENTS.md) holds the rules every contributor and every coding agent follows: the licence, privacy and security rules, the checks, the boundaries and the limits on sub-agents. It does not hold how you like to work. Whether an agent delegates by default, which models it prefers, how terse it is and which tools it reaches for are your choice, so they live in a file only you read.

## What goes where

| Belongs in `AGENTS.md` (shared)                                         | Belongs in your own file (personal)                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Tests first, the checks to run, the 7-day rule for packages             | How much to delegate to sub-agents, and when to ask before doing so  |
| At most three sub-agents at once, and clean-up after them               | Which model or tier you want for which kind of task                  |
| Merge only with the person's own authorisation                          | Opt-in rules for a tool feature, such as a workflow or planning mode |
| No assistant attribution, no maintainer name, a plain neutral voice     | Tone, length of replies, the language you chat in                    |
| A model above the most capable tier only when a human has authorised it | Your editor, shell and terminal habits                               |

Your file can add to the rules, never relax one. A line in it cannot authorise a merge, an exception to "Ask the maintainer first" or a skipped check: those need your own words in the conversation, as `AGENTS.md` says.

## Claude Code

Create `CLAUDE.local.md` in the repository root. Claude Code reads it with `CLAUDE.md`, and `.gitignore` already excludes it, so it is never committed. For preferences that apply to every project, use your user-level file, `~/.claude/CLAUDE.md` (on Windows, `.claude\CLAUDE.md` in your user folder).

A git worktree is a separate folder and does not contain the ignored file. Copy it into the worktree, or keep the preference in your user-level file.

## Other tools

`AGENTS.local.md` is also git-ignored, but no tool loads it by itself. Either start a session with "read `AGENTS.local.md` first", or put the same text in the tool's own user-level instruction file. These paths were not checked for this guide, so confirm them in the tool's documentation:

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
