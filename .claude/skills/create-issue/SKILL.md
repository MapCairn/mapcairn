---
name: create-issue
description: Create a well-formed GitHub issue for MapCairn with the gh CLI. Use whenever someone asks to log, file, raise or track a bug, feature, task or idea, or when work turns up a problem or opportunity that should be tracked and cannot be fixed in the same session.
---

# Create an issue

Issues are how MapCairn tracks work. They are public, so write plain project facts only. Use the `gh` CLI for everything.

## Before you write

1. Check the CLI works: `gh auth status`. If it is not signed in, ask the person to run `gh auth login` themselves (in Claude Code they can type `! gh auth login`).
2. Do not file an issue for a gap you can fix in the same session. Fix it, in a pull request (see the `pick-up-issue` skill).
3. Search for a duplicate first, open and closed:
   `gh issue list --repo MapCairn/mapcairn --state all --search "<key words>" --limit 20`
   (Always name the repository with `--repo MapCairn/mapcairn`: in a clone of a fork the default is the fork, which has no issues.)
   If one exists, comment on it with the new facts instead of filing another.
4. Read `ROADMAP.md` if the idea might be something the project has said it will not do. Adding a dataset, a runtime dependency to an SDK package, or anything that changes `PRIVACY.md`, `SECURITY.md`, the licence or `CLA.md` is the maintainer's decision: say so in the issue and do not start the work.

## Choose the kind

- **Bug**: something behaves wrongly. Mirror `.github/ISSUE_TEMPLATE/bug_report.yml`: what happened, what was expected, numbered steps to reproduce, device and browser, and the area. Remove map coordinates from address links you paste if the person would not want them shared.
- **Feature or improvement**: mirror `.github/ISSUE_TEMPLATE/feature_request.yml`: the problem, what is wanted, and the keyboard, screen-reader and data-use implications.
- **Task, refactor or research**: a short goal, why it is worth doing, and what done looks like.

## Write the body

- A one-line title in sentence case that says the outcome or the fault, not "Improve X".
- Context first (what exists now, with file paths in backticks), then the proposal or the fault, then constraints, then a **task list** of small checkboxes the person who picks it up can tick as they go. Put the test the work starts with as the first task.
- Say which documents the work will update (`ARCHITECTURE.md`, `DESIGN.md`, guides, READMEs, `PRIVACY.md`).
- For a large change that crosses several packages or decides a public API, add a task "Plan in `docs/plans/`" (see `docs/plans/README.md`) and link the plan from the issue when it exists. Everything else keeps its design notes in the issue.
- Neutral voice. No emails, keys, private details, `@mentions` of people, employer references, assistant attribution, or names of commercial products used as comparisons. Do not name the maintainer.
- Do not describe a planned feature as if it exists.

## Labels and milestone

Apply the area labels that fit from: `map`, `search`, `layers`, `design-system`, `a11y`, `performance`, `privacy`, `plan`, plus one of `bug` or `enhancement` (and `documentation` for docs-only work). Check `gh label list --repo MapCairn/mapcairn` and `gh api repos/MapCairn/mapcairn/milestones --jq '.[].title'`; use a milestone when one clearly fits and none otherwise. Do not invent labels.

## File it

Write the body to a temporary file so formatting survives, then:

```bash
gh issue create --repo MapCairn/mapcairn --title "<title>" --body-file <path> --label "enhancement,map" [--milestone "<title>"]
```

On a fork, or without write access to the repository, labels and milestones may be refused: file it without them and say so. Print the issue URL back to the person.

## Afterwards

- If the issue is a child of a tracking issue, tick or add it in the tracker's task list (`gh issue edit <n> --body-file`), keeping the rest of the text unchanged.
- If the work is queued for you or another agent, say so in your reply and, if the person asked, start it with the `pick-up-issue` skill.
