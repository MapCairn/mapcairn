---
name: plan-change
description: Write a plan in docs/plans/ for a large MapCairn change, one that crosses several packages or decides a public API, and open it as its own pull request for review before any code is written. Use when an issue says "Plan in docs/plans/", when someone asks to plan, design or scope a large change, or when pick-up-issue meets an issue too large to build directly.
---

# Plan a change

`docs/plans/README.md` says what a plan is and when one is needed; read it first. Most issues need no plan, only design notes and a task list in the issue (`pick-up-issue`, section 3). This skill covers the plan and its pull request. Turning a merged plan into issues is the `split-plan` skill.

Example: issue #43 asks for a MapLibre adapter as an optional SDK package. It crosses `core`, `map` and `web` and decides a public API, so it gets `docs/plans/0001-maplibre-adapter-package.md`. It waits on #24, which it says under Ground rules, and its open questions (the package name, how the engine CSS ships) go to the maintainer with a recommendation.

## 1. Check a plan is needed

1. Do the preflight in `pick-up-issue` section 0 and read the issue with all its comments.
2. If the change touches one package and decides no public API, stop and tell the person the issue is enough. If it needs a maintainer decision listed in `AGENTS.md` ("Ask the maintainer first"), the plan may state the question but not settle it.
3. Find the tracking issue. If there is none, file one with the `create-issue` skill. Either way it carries the `plan` label.
4. Choose the next number: one more than the highest ever used. Finished plans are deleted, so also look in history: `git fetch <origin-or-upstream>`, then `git log <origin-or-upstream>/main --name-only --format= -- docs/plans`, the open pull requests (`gh pr list --repo MapCairn/mapcairn --state open --limit 200 --json files --jq '.[].files[].path | select(startswith("docs/plans/"))'`) and the numbers in the tracking issues. File name `NNNN-short-name.md`.

## 2. Investigate

Read the "Read before you change" sections of `ARCHITECTURE.md` and `DESIGN.md` for the code involved, `ROADMAP.md` for what the project will not do, and the code each step would touch, not only the documents about it. The first plan's review found four blocking errors that a read of the code exposed: a wrong step order, a template variable with no supplier, three draw paths that would not redraw, and announcements lost to the throttle. Note the issues this one depends on or blocks (a plan that waits on another issue says so under Ground rules), what already exists (do not plan what is built), what you rule out and why, and what the simplest version costs to build and to keep. Do not describe a planned feature as existing.

## 3. Write the plan

Keep it readable in a few minutes. Every heading below is required; write "None" rather than drop one.

```markdown
# NNNN: Title in sentence case

Status: proposed. Tracking issue: #<n>.

## Goal
What changes for a user or a host, in two or three sentences.
## Ground rules
Constraints from AGENTS.md and the issue that shape the design.
## Design
Packages, ports, files, lint rules and manifests touched, and the public API in outline. Options rejected, with why.
## Tests
The failing tests the work starts with, and how each is proved.
## Order of work
Numbered steps, each independently shippable (one pull request, build green), each with the files it touches.
## Documents to update
Which of README, ARCHITECTURE, DESIGN, guides and PRIVACY change, and in which step.
## Risks
What could go wrong and how it is contained.
## Decided and open
Decisions made, with the date and reason. Open questions, each with a recommendation.
```

For each open choice, give the cost to build and keep against the benefit, and recommend the simpler option. Neutral voice, British English, no em dashes. No maintainer name, no commercial comparison, no assistant attribution.

## 4. Open the pull request

1. Add the plan to the list at the end of `docs/plans/README.md`, replacing "No plan is open." when it is the first.
2. Branch `docs/plan-<short-name>` from the project's `main`, run `npm run lint`, commit as `docs(plans): <title>`, push.
3. Continue with `land-pr`. The description says `Part of #<n>` and asks reviewers for the open questions. A plan is reviewed, not merged on your own authority unless a human authorised it.
4. Before it merges, a reviewer other than the author verifies the plan against `main` (the `land-pr` review, with this checklist): every file, symbol and call the plan names exists and works as it says, the steps build in the order given, and nothing a step needs is left without a supplier. Fix what the review finds first.
5. After it merges, link the plan from the tracking issue and tick its "Plan" task, editing from the current body (`gh issue view <n> --json body --jq .body > <file>`) so nothing is overwritten. Without triage rights, post that status as a comment or in the pull request description and leave ticking, closing and labels to the maintainer.

## 5. Report

Use the report in `AGENTS.md` ("Definition of done"): the plan's pull request, the checks, and under **Issues to file** the tracking issue if you created one. List the open questions that need the maintainer.
