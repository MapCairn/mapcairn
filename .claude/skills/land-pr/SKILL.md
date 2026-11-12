---
name: land-pr
description: Open, review and land a MapCairn pull request with the gh CLI - write the description, run a fresh-eyes review, watch CI, fix failures, and merge only when the person has authorised merging and every required check is green. Use after `pick-up-issue` has produced a verified branch, or whenever someone asks to open, review, update or merge a pull request.
---

# Land a pull request

`AGENTS.md` and `CONTRIBUTING.md` are the authority; this is the procedure. Changes reach `main` only through a pull request. Never push to `main` and never skip a hook (`--no-verify`).

## 1. Open it

1. The branch is pushed and its checks from `pick-up-issue` passed. If not, finish that first.
2. Write the body to a file, plain project facts in a neutral voice, following `.github/pull_request_template.md`:
   - What and why, with `Fixes #<n>` (the issue is finished by this pull request) or `Part of #<n>` (it is not).
   - The documents you updated, or why none needed it.
   - The checks you ran with their results, and any that failed or were skipped.
   - Screenshots for a visible change (light and dark, phone and desktop), attached to the pull request.
   - That `simplify` was run.
3. `gh pr create --title "<Conventional Commit title>" --body-file <file>`, from a fork with `--repo MapCairn/mapcairn --head <your-login>:<branch>` if you do not have write access.
4. No assistant attribution in the title, body or commits, no `@mentions` of people, no maintainer name, no names of commercial products used as comparisons.
5. A first pull request needs the CLA comment (the sentence at the end of `CLA.md`) from the author's own account. Tell the person if it is missing; do not post it for them.

## 2. Review it with fresh eyes

Review the opened pull request before it merges, and fix what is real.

- If the `pr-review-toolkit` plugin is installed, run `/pr-review-toolkit:review-pr` on the pull request. Otherwise run the `code-review` skill, or read the diff yourself against the checklist below.
- Checklist: does it solve the issue; is there a test that failed first and still means something; behaviour on the keyboard and for a screen reader; no id, kind or provider switched on in code; package boundaries respected; docs match the behaviour; copy in British English; nothing sent over the network that `PRIVACY.md` does not mention; no secrets, no identifying data, no dependency added without need.
- Apply fixes as new commits, push, and re-run the affected checks. Leave a short comment on the pull request saying what the review found and what changed. A finding you decline gets a one-line reason.
- Anything real but out of scope becomes its own issue (`create-issue` skill), linked from the pull request.

## 3. Watch CI

```bash
gh pr checks <n> --watch --fail-fast
```

The `build` and `e2e` checks are required, and the `CLA` check must be green for a contributor. If a check fails, read its log (`gh run view <run-id> --log-failed`), fix the cause in a new commit, and push. Do not retry a failing run blindly, weaken an assertion, or exclude code from coverage. A genuinely flaky test gets an issue; one re-run is fine, a pattern of re-runs is not.

If the branch is behind `main` and the ruleset needs it current: `gh pr update-branch <n>` or rebase, then wait for the checks again.

## 4. Merge only with authority

- Merge only when the person has authorised merging for this pull request or for the run (for example "merge when the checks pass"). Authorisation covers the pull requests they said it for; it does not carry to unrelated ones. Without it, stop at a green pull request and tell the person it is ready.
- Merge only when every required check is green, review threads are resolved, and you have nothing left unreported. If you do not have write access, you cannot merge: say the pull request is ready for the maintainer.
- Never deploy production any other way than merging to `main`, which deploys automatically. Treat every merge as a production deploy.
- Merge with a squash and an explicit body, so no earlier trailer carries over:

```bash
gh pr merge <n> --squash --subject "<Conventional Commit title> (#<n>)" --body "<one or two plain sentences and Fixes #<issue>>"
```

  Do not use `--admin` to get past a failing or missing check.

## 5. Close out

1. Confirm the merge: `gh pr view <n> --json state,mergedAt`.
2. If `Fixes #<n>` did not close the issue, or the pull request was `Part of`, tick the issue's task list and close it only when all the work is merged and verified (`gh issue close <n> --comment "<what shipped>"`).
3. Update the tracking issue if there is one.
4. Remove the branch and worktree: `git switch main && git pull --ff-only && git branch -d <branch>`, and `git worktree remove <path>` if you made one.
5. Stop anything you left running and check the ports are free.
6. Pick the next issue with `pick-up-issue`, if the person asked for a queue.
