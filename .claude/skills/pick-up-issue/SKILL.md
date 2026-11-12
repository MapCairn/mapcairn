---
name: pick-up-issue
description: "Take a MapCairn GitHub issue from \"open\" to a verified branch ready for a pull request, with the gh CLI: claim it, plan, write the failing test first, implement, update the docs, run the checks, look at the running app, and simplify. Use whenever someone says pick up, take, do, work on or fix an issue (by number or link), or asks for the next issue in the queue. Continue with the `land-pr` skill to open and merge the pull request."
---

# Pick up an issue

This skill is the working procedure behind `AGENTS.md`. Where they differ, `AGENTS.md` wins. It covers the work up to a pushed, verified branch; the `land-pr` skill covers the pull request, review, CI and merge.

## 0. Preflight

1. `gh auth status` must succeed. If not, ask the person to run `gh auth login` in their own terminal.
2. Find out what you may do, naming the repository so a fork cannot be mistaken for it: `gh repo view MapCairn/mapcairn --json viewerPermission --jq .viewerPermission`.
   - `WRITE`, `MAINTAIN` or `ADMIN`: branch in this repository. The shared remote is `origin`.
   - Anything else: fork with `gh repo fork MapCairn/mapcairn --remote` (add `--clone` if you have no clone yet; your fork becomes `origin` and the project `upstream`), then `gh repo set-default MapCairn/mapcairn`. Work on the fork and open the pull request from it. A first pull request also needs the CLA comment described in `CONTRIBUTING.md`.
   - Add `--repo MapCairn/mapcairn` to any `gh issue` or `gh pr` command if you have not set the default.
3. Commit with an email address linked to your GitHub account (check `git log -1 --format=%ae` before you push), or the `CLA` check cannot find you. Use Node 24 or newer and npm 11 or newer.
4. Read `AGENTS.md` (including "Sub-agents") and your tool's own instruction file, and follow them exactly.

## 1. Understand the issue

1. `gh issue view <n> --comments` and read every comment; later comments may change the scope or record a decision.
2. Check nobody else has it: the assignees, and `gh pr list --state all --search "#<n>"`. If another open pull request already covers it, stop and tell the person. If one only touches the same module, keep your change additive and rebase before you push.
3. Stop and report, without starting, if the issue needs a decision that is the maintainer's: adding a dataset, adding a runtime dependency to an SDK package, anything whose terms an SDK package would carry, changing the licence, `CLA.md`, `PRIVACY.md`, `SECURITY.md` or the repository ruleset, or deploying production. Say which decision is needed in a short comment on the issue.
4. Open the documents that match the code you will touch, using the "Read before you change" table in `AGENTS.md`.
5. If the issue is a tracker, do not work it directly: pick up its children, or, if it has none and its plan is merged, use the `split-plan` skill.

## 2. Claim it and branch

With write access: `gh issue edit <n> --add-assignee "@me"` and a one-line comment with the branch name. On a fork, comment only. Run `git fetch <origin-or-upstream>`, branch from the project's current `main` with `git switch -c <type>/<short-name> <origin-or-upstream>/main` (`origin` with write access, `upstream` on a fork; types `feat`, `fix`, `docs`, `refactor`, `test`, `chore`), and push with `git push -u origin <branch>`.

Several issues at once, or an agent beside you, means a separate worktree for each (`git worktree add ../mapcairn-<name> -b <branch> <origin-or-upstream>/main`). There `npm ci` fails at `prepare`: use `npm ci --ignore-scripts` and run `npm run lint` yourself before each commit. Do not install into a working tree another person or agent is using. Give each concurrent e2e or dev server its own port (`MAPCAIRN_E2E_PORT`, and a different dev port).

## 3. Plan

- Most issues need only a short plan in your head or as an issue comment: the files you will change, the test you will start with, the documents you will update.
- A large change that crosses several packages or decides a public API needs a plan in `docs/plans/` first: use the `plan-change` skill, merge the plan first, then `split-plan`. Split independent parts into separate pull requests, each keeping the build green, and keep a deletion in its own change.
- Where a choice is the person's and they are present, ask. Where they are away, take the simplest option that satisfies the issue and record the decision and its reason in a comment on the issue.

## 4. Build it, test first

1. Write a failing behavioural test, run it, and see it fail for the intended reason. Implement the smallest change that passes. Do not weaken assertions or exclude code from coverage.
2. Follow the principles and conventions in `AGENTS.md` (`npm run licence:write` adds the SPDX header). Add no dependency without need; if you must, follow its dependency rules.
3. Keep to the task. Anything unrelated that you notice becomes its own issue (`create-issue` skill). A delegated agent lists it under **Issues to file** in its report instead, and its caller files it.
4. Tick the issue's task list as steps land: start from the current body (`gh issue view <n> --json body --jq .body > <file>`), change only the boxes, and save it with `gh issue edit <n> --body-file <file>`. Without triage rights, post the status as a comment or in the pull request description and leave ticking, closing and labels to the maintainer.
5. Commit in small steps with Conventional Commits and no assistant attribution.

## 5. Documents

A change that alters behaviour the documents describe updates them in the same pull request: `README.md` and package READMEs, `ARCHITECTURE.md`, `DESIGN.md`, `docs/guides/`, and `ROADMAP.md`, `ATTRIBUTIONS.md` or `PRIVACY.md` (the last together with `packages/web/src/app/PrivacyPage.tsx`). Note which ones in the pull request.

## 6. Checks

- Any code: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`. A map or interface change adds the browser runs described below.
- Documents only: `npm run lint`, then the read-through in section 8. Dependencies: the real install and `npm ci --ignore-scripts` check in `AGENTS.md`.

Install the browsers once with `npm run playwright:install -w @mapcairn/web`. A full local `e2e` or `a11y` run can take hours when several agents share the machine. Run the Playwright specs that cover the change (`npm run test:e2e -w @mapcairn/web -- e2e/<name>.spec.ts`). Run the full `e2e` and `a11y` when the change is to layout, the map engine or the test seam; otherwise name the full runs as left to CI under Checks (the required `e2e` check runs both). A timeout that passes when that spec is run alone is a load flake: re-run it alone, say so in the report, and never weaken an assertion or lengthen a timeout to hide it. Report anything that failed or was skipped.

## 7. Look at it

For a map or interface change, run the `visual-check` skill and describe what it saw in the pull request, saying the images are kept locally and will be attached on request, with no local path. A change with no visible effect says so in the report instead.

## 8. Simplify, read, hand over

1. Run your tool's simplify step on your diff if it has one; otherwise reread the diff for logic an existing helper already does, code or options nothing uses, functions with two jobs and comments that a better name would replace. Apply the fixes and re-run the checks they touched. If another agent started you, do not start sub-agents: run this step and the `land-pr` review checklist inline, and your caller runs the independent review.
2. Read the changed text once for British English, plain prose and no em dashes. `npm run lint` is the only automated check for documents, so this step is the rest of the check, for code changes too.
3. Stop every dev server, wrangler instance and browser you started, and check the ports are free.
4. Push the branch and continue with the `land-pr` skill. If you stop here, hand off with the report in `AGENTS.md` ("Definition of done").

## 9. Briefing an agent

If you can start sub-agents and `AGENTS.md` or the person allows it, within the limits and model tiers in `AGENTS.md` ("Sub-agents"), name the `implementer` agent where your tool has it and set its model tier yourself (the agent file sets none), and copy this block, filling the angle brackets and leaving out the line that does not apply. For layout, engine or test-seam work, replace the Checks line with a full `e2e` and `a11y` run (section 6):

```
Take issue #<n> in MapCairn/mapcairn and open the pull request. Do not merge. Do not start sub-agents.
Follow the `pick-up-issue` skill, then `land-pr`. Read AGENTS.md and the documents "Read before you change" names for <area>.
Checks: lint, typecheck, coverage and build, and targeted specs only, on your own port <port>. Leave the full e2e and a11y runs to CI.
UI work: run the visual-check skill and describe what you saw in the pull request.
Other work in flight on <module>: <issue or pull request>. Keep your change additive and rebase before you push.
No assistant attribution anywhere. Plain neutral voice on GitHub, no @mentions.
Stop every server, browser and wrangler instance you start and confirm with a port check. Keep your worktree until the pull request has merged.
Report with the five headings in AGENTS.md "Definition of done": PR, Checks, Seen, Deviations, Issues to file.
```
