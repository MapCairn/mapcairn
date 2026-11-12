---
name: pick-up-issue
description: Take a MapCairn GitHub issue from "open" to a verified branch ready for a pull request, with the gh CLI - claim it, plan, write the failing test first, implement, update the docs, run the checks, look at the running app, and simplify. Use whenever someone says pick up, take, do, work on or fix an issue (by number or link), or asks for the next issue in the queue. Continue with the `land-pr` skill to open and merge the pull request.
---

# Pick up an issue

This skill is the working procedure behind `AGENTS.md`. Where they differ, `AGENTS.md` wins. It covers the work up to a pushed, verified branch; the `land-pr` skill covers the pull request, review, CI and merge.

## 0. Preflight

1. `gh auth status` must succeed. If not, ask the person to run `gh auth login` (in Claude Code: `! gh auth login`).
2. Find out what you may do, naming the repository so a fork cannot be mistaken for it: `gh repo view MapCairn/mapcairn --json viewerPermission --jq .viewerPermission`.
   - `WRITE`, `MAINTAIN` or `ADMIN`: branch in this repository. The shared remote is `origin`.
   - Anything else: fork first with `gh repo fork MapCairn/mapcairn --remote` (this makes your fork `origin` and the project `upstream`), then `gh repo set-default MapCairn/mapcairn` so issue and pull request commands target the project. Work on the fork and open the pull request from it. A first pull request also needs the CLA comment described in `CONTRIBUTING.md`.
   - From here on, add `--repo MapCairn/mapcairn` to any `gh issue` or `gh pr` command if you have not set the default.
3. Commit with an email address linked to your GitHub account (`git config user.email`; check `git log -1 --format=%ae` before you push), or the `CLA` check cannot find you.
4. Node 24 or newer and npm 11 or newer (`node -v`, `npm -v`).
5. Read `AGENTS.md`, and any `CLAUDE.md` rules about sub-agents, model tiers, process limits and workflows. Follow them exactly.

## 1. Understand the issue

1. `gh issue view <n> --comments` and read every comment; later comments may change the scope or record a decision.
2. Check nobody else has it: the assignees, and `gh pr list --state all --search "#<n>"`. If another open pull request already covers it, stop and tell the person.
3. Stop and report, without starting, if the issue needs a decision that is the maintainer's: adding a dataset, adding a runtime dependency to an SDK package, anything whose terms an SDK package would carry, changing the licence, `CLA.md`, `PRIVACY.md`, `SECURITY.md` or the repository ruleset, or deploying production. Say which decision is needed in a short comment on the issue.
4. Open the documents that match the code you will touch, using the "Read before you change" table in `AGENTS.md` (the named sections of `ARCHITECTURE.md` and `DESIGN.md`).
5. If the issue is a tracker, do not work it directly: pick up its children.

## 2. Claim it

If you have write access: `gh issue edit <n> --add-assignee "@me"` and a one-line comment, for example "Working on this", with the branch name. On a fork, comment only.

## 3. Branch

Branch from the project's current `main`: `origin/main` when you have write access, `upstream/main` on a fork.

```bash
git fetch <origin-or-upstream>
git switch -c <type>/<short-name> <origin-or-upstream>/main   # feat/, fix/, docs/, refactor/, test/, chore/
```

Push with `git push -u origin <branch>`; on a fork that is your fork.

Several issues at once, or an agent working beside you, means a separate worktree for each (`git worktree add ../mapcairn-<name> -b <branch> main`). In a worktree `npm ci` fails at `prepare`: use `npm ci --ignore-scripts` and run `npm run lint` yourself before each commit. Do not install into a working tree another person or agent is using. Give each concurrent e2e or dev server its own port (`MAPCAIRN_E2E_PORT`, and a different dev port).

## 4. Plan

- Most issues need only a short plan in your head or as an issue comment: the files you will change, the test you will start with, the documents you will update.
- A large change that crosses several packages or decides a public API needs a plan in `docs/plans/` first (see `docs/plans/README.md`), merged through its own pull request before code, with the issue linked from the file. Use the `land-pr` skill for the plan's pull request.
- If the work divides into independent parts, split the parts into separate pull requests, each keeping the build green. Delete code and documents that nothing needs, but keep such a deletion in its own change.
- Where a choice is the person's and they are present, ask. Where they are away, take the simplest option that satisfies the issue, and record the decision and its reason in a comment on the issue.

## 5. Build it, test first

1. Write a failing behavioural test, run it, and see it fail for the intended reason.
2. Implement the smallest change that passes. Do not weaken assertions or exclude code from coverage.
3. Follow the principles in `AGENTS.md`: depend on ports, add behaviour by adding a definition or an adapter (never switch on an id), one job per function, named constants, braced early returns, TSDoc on every export, the SPDX header on new files (`npm run licence:write`), British English in copy, tokens only for styling, semantic HTML and a keyboard equivalent for every gesture.
4. Add no dependency without need. If you must, follow the dependency rules in `AGENTS.md` (a real `npm install`, a real `npm ci --ignore-scripts` check, and nothing published in the last 7 days without the maintainer's say-so).
5. Keep to the task. Anything unrelated that you notice becomes its own issue (use the `create-issue` skill), not part of this change.
6. Tick the issue's task list as steps land: `gh issue edit <n> --body-file <file>` with only the boxes changed.
7. Commit in small steps with Conventional Commits. Add no assistant attribution: no `Co-Authored-By` trailer naming an AI tool and no "Generated with" line.

## 6. Documents

A change that alters behaviour the documents describe updates them in the same pull request: `README.md` and package READMEs, `ARCHITECTURE.md`, `DESIGN.md`, the guides in `docs/guides/`, and `ROADMAP.md`, `ATTRIBUTIONS.md` or `PRIVACY.md` (the last together with `packages/web/src/app/PrivacyPage.tsx`) when touched. Note which ones in the pull request.

## 7. Checks

Run what matches the change, and report anything that failed or was skipped.

| Change | Run |
| --- | --- |
| Any code | `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build` |
| Map or interface | the above, plus `npm run e2e` and `npm run a11y` |
| Documents only | `npm run lint` (and a read-through for British English and plain prose) |
| Dependencies | the real install and `npm ci --ignore-scripts` check in `AGENTS.md` |

Install the browsers once with `npm run playwright:install -w @mapcairn/web`. Playwright starts the server itself on 4173 or `MAPCAIRN_E2E_PORT`.

## 8. Look at it

Map or interface changes must be confirmed visually. Linters and tests cannot tell you that something looks bad, is hard to use or breaks the harmony of the design. Run the app and look at real screenshots at phone, tablet and desktop sizes, in both themes, and over more than one basemap where the map shows. Say what looks wrong, fix it, and keep the screenshots for the pull request. A change with no visible effect says so instead.

## 9. Simplify, then hand over

1. Run the `simplify` skill on your diff and apply its fixes, then re-run the checks it touched.
2. Stop every dev server, wrangler instance and browser you started, and check the ports are free.
3. Push the branch and continue with the `land-pr` skill.

## Using sub-agents

If `CLAUDE.md` or the person allows sub-agents, brief each like a colleague who has not seen the conversation: the goal, the issue number, the documents to read, what is already ruled out, the checks to run, the visual-confirmation rule, the no-attribution rule, and what to report back. Say in every brief that the agent stops what it starts and confirms with a port check. Respect any limit on how many may run at once and which models they may use.
