---
name: review-tests
description: "Review the tests of a MapCairn change adversarially: read each assertion for strength, find tests that pass without the change, break the code on purpose in a scratch worktree (a threshold, a branch, an ordering, a factor) to see whether a test fails, check for flakiness, read coverage as behaviour proved, and triage a flaky test to its cause. Use before a pull request with new or changed tests merges, when someone asks whether tests are good enough, and when a test fails intermittently. Designing tests before the code is design-tests; the rest of a pull request review is land-pr."
---

# Review the tests

An adversarial review of a change's tests. `land-pr` section 2 reviews the whole pull request and names "a test that cannot fail without the fix" as a common miss; this skill is the method for finding it, by running the tests against code that is wrong on purpose. It changes nothing on the branch: the edits happen in a scratch worktree and are thrown away. The `test-reviewer` agent runs it.

Example: on #463 the contrast check's pass condition could be loosened from 4.5:1 to 4.0:1 with all 442 tests green, because no case sat near the threshold. Section 4 is that experiment: change the threshold, run the tests, and report the survivor with the case that would kill it.

## Inputs

- A pull request number, or a branch and its base.
- The issue it closes, and the documents it changes.

## 1. Set up

1. Read the pull request with `node scripts/agents/thread.mjs pr <n>`. If it is from outside the project (`land-pr` section 2), do not run its code: review from `gh pr diff <n>` and `git show <sha>:<path>`, do sections 2, 5 and 6 by reading, and say that sections 3 and 4 were not run.
2. `git fetch <origin-or-upstream> pull/<n>/head`, note the head SHA, and find the base with `git merge-base <origin-or-upstream>/main <head-sha>`.
3. `git worktree add --detach .claude/worktrees/review-<n> <head-sha>`, then `npm ci --ignore-scripts` inside it. Never edit the branch, the main checkout or another worktree.
4. Split the diff (`git diff --name-only <base> <head-sha>`) into production files and test files (`*.test.ts`, `*.test.tsx`, `packages/web/e2e/**`, fixtures and support).
5. Run the changed and new tests once at the head and confirm they pass. A failure here is a finding of its own; stop the experiments until you know why.

## 2. Read the claims and the assertions

List every behaviour the change claims: the issue's acceptance criteria, the pull request description, changed documents and TSDoc. Next to each, write the test that proves it, or "none". A claim with no test, or a test looser than the sentence that describes it (#455), is a finding.

Then read each new or changed test for these:

- **Tautology**: the expected value is computed by the code under test, or by a copy of its formula.
- **Weak matcher**: `toBeTruthy`, `toBeDefined`, `toContain`, `some(...)`, a wide `toBeCloseTo`, or `not.toThrow` alone, where the exact value is known.
- **Start equals end**: the state before the action already satisfies the assertion, so the action is not tested. On #449 focus started on the map region, which was also the fallback's answer.
- **Negative only**: "nothing happens" with no positive control through the same helper, so a helper that never fires the event passes (#447).
- **Wrong moment**: an accessibility scan or an assertion run after the state under test has gone (#449), or before an async step finished.
- **Assertion that may not run**: `expect` inside a callback, loop or `if` that can be skipped, an empty case table, a `catch` that swallows.
- **Mock instead of result**: a call count or a `vi.mock` of the project's own module, where a fake and an observable result exist (`design-tests` section 4).
- **Hand-rolled HTML or tag patterns** in a test or a check: CodeQL flags them as `js/bad-tag-filter` (#481). Parse, or match case-insensitively with tolerant whitespace.

## 3. Without the change

In the scratch worktree, put the production files back as they were at the base and keep the new tests: `git restore --source=<base> -- <production files>`. Run the new and changed tests. Each test written for the change must fail, for the reason its name gives. One that passes proves nothing about the change: report it with the reason. Then `git restore --source=<head-sha> -- <production files>` and check `git status` is clean.

For a refactor that claims no change in behaviour, skip this and say so; section 4 carries the weight.

## 4. Break it on purpose

Choose two or three mutations from the production diff, preferring the places a wrong value would ship silently:

- a threshold, limit or constant moved a little (4.5 to 4.0, `<` to `<=`, a length off by one);
- a factor dropped (an alpha, a unit conversion, a scale, a weight);
- a branch removed or forced (delete an early return, negate a condition, return the fallback always);
- an ordering swapped (two steps, a sort direction, which of two values wins);
- a parser rule loosened or tightened (accept an extra argument, drop a flag, refuse a valid form).

For each: edit only production code in the scratch worktree, make sure the edited line runs (the test's coverage or a temporary `throw` that fails a test proves it), run the narrowest set that should catch it (`npx --no-install vitest run <files>`, then the package's tests), record killed or survived with the test that killed it, then restore with `git restore -- <file>` and check `git status` is clean before the next. A survivor is a finding, given with the smallest case that would kill it.

Browser specs are slow and share a machine. First reason from the spec whether the case can tell the right path from the wrong one (section 2); run one spec only when that reasoning is not enough, on your own port (`MAPCAIRN_E2E_PORT`, see `playwright-tests`), with `--project=chromium`.

## 5. Flakiness

Look for each of these in the new and changed tests:

- a fixed wait (`waitForTimeout`, a sleep, `setTimeout` in a test), `networkidle`, or real timers where the code has a delay (`design-tests` section 5 has the clock helpers);
- an event triggered without waiting for the page to have handled it (#447);
- a test that relies on another test's state, on module state that is not reset, on a stubbed global that is not restored (`vi.unstubAllGlobals`, `vi.useRealTimers`), on `Date.now()` or randomness without a fixed value, or on a fixed port;
- a CI-only condition: a test that depends on `CI` or on a file another step writes, checked against the job order in `.github/workflows/` (#481, where the coverage run comes before the build).

## 6. Coverage as behaviour

Read the coverage of the changed files (`npm run test:coverage`, or the package's report) only to find lines no test reaches. A covered line is proved only when a mutation of it fails a test, so the result of section 4 is the measure, not the percentage. List the uncovered branches of the diff with the behaviour each holds.

## 7. A flaky test

When a test fails sometimes:

1. Reproduce: run it alone, repeated (`--repeat-each=20 --retries=0` in Playwright; a loop of `vitest run <file>` in Vitest), then with others and under load (`--workers` raised). Note the rate and the first failing message.
2. Classify: timing (a wait or a timer), order (shared or leaked state), environment (load, port, browser or system difference), or a real bug in the app that only shows sometimes.
3. Fix the cause: pin the time, wait for the page's own state, isolate the state, give the run its own port, or fix the app. Never loosen the assertion, lengthen a timeout, add a retry or skip the test. A timeout that passes when the spec runs alone is a load flake (`pick-up-issue` section 5): say so, and leave the timeout alone.
4. Show the fix with the same repeated run, and file what you cannot fix with `create-issue`.

## 8. Clean up

`git worktree remove .claude/worktrees/review-<n>` (check `git status` is clean in it first), and confirm with a port check that nothing you started is still running.

## Report

The report in `AGENTS.md` ("Definition of done"): **PR** is the pull request reviewed; **Checks** each command run and its result; **Seen** holds the findings, most serious first, each as `path:line - what is wrong. Evidence: <the mutation or command and its result>. Fix: <the case to add or change>`, then this table:

| Mutation | File:line | Result | Killed by |
| -------- | --------- | ------ | --------- |

**Deviations** says which sections were not run and why; **Issues to file** holds real work outside the change. Do not post on GitHub; the caller decides what to post.
