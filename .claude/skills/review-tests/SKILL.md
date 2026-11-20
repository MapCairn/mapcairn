---
name: review-tests
description: "Review the tests of a MapCairn change adversarially: read each assertion for strength, find tests that pass without the change, break the code on purpose in a scratch worktree (a threshold, a branch, an ordering, a factor) to see whether a test fails, check for flakiness, read coverage as behaviour proved, and triage a flaky test to its cause. Use before a pull request with new or changed tests merges, when someone asks whether tests are good enough, and when a test fails intermittently. Designing tests before the code is design-tests; the rest of a pull request review is land-pr."
---

# Review the tests

An adversarial review of a change's tests. `land-pr` section 2 reviews the whole pull request and names "a test that cannot fail without the fix" as a common miss; this skill is the method for finding it, by running the tests against code that is wrong on purpose. It changes nothing on the branch: the edits happen in a scratch worktree and are thrown away. The `test-reviewer` agent runs it.

Example: on #463 the contrast check flattened a translucent text colour over its surface before measuring it. Deleting that step left all 442 theme tests green, because no case used a translucent foreground. Section 4 is that experiment: change one thing, run the tests, and report the survivor with the case that would kill it.

## Inputs

- A pull request number, or a commit and its base (for a past change, the commit and its first parent).
- The issue it closes, and the documents it changes.

## 1. Set up

1. Read the pull request with `node scripts/agents/thread.mjs pr <n>`. If it is from outside the project (`land-pr` section 2), do not run its code: review from `gh pr diff <n>` and `git show <sha>:<path>`, do sections 2 and 5 by reading, and say that sections 3 and 4 were not run.
2. `git fetch <origin-or-upstream> pull/<n>/head`, note the head SHA, and find the base with `git merge-base <origin-or-upstream>/main <head-sha>`.
3. `git worktree add --detach .claude/worktrees/review-<n> <head-sha>`, then `npm ci --ignore-scripts` inside it. Never edit the branch, the main checkout or another worktree.
4. List the diff with `git diff --stat <base> <head-sha>` and read large files (a long table row in `DESIGN.md`) by their added lines only (`git diff -U0 <base> <head-sha> -- <file>` shows the changed lines with no context; read the ones that start with `+` by eye), not whole. Sort the files into code (what ships), tests (`*.test.ts`, `*.test.tsx`, `packages/web/e2e/**`, fixtures and support) and documents.
5. Run the changed and new tests once at the head and confirm they pass. Run Vitest from the package folder, as one command: `cd .claude/worktrees/review-<n>/packages/<name> && npx --no-install vitest run src/<file>`. From the repository root the config also loads `packages/web`, which needs the built SDK. That joined `cd` form is the only one the reviewer write guard accepts, and a subagent's working folder is reset between calls. A failure here is a finding of its own; stop the experiments until you know why.

## 2. Read the claims and the assertions

List every behaviour the change claims: the issue's acceptance criteria, the pull request description, changed documents and TSDoc. Next to each, write the test that proves it, or "none". A claim with no test, or a test looser than the sentence that describes it (#455), is a finding.

Then read each new or changed test for these. The first three apply to any test; the next three mostly to components and browser specs.

- **Tautology**: the expected value comes from the code under test, from a copy of its formula, or from a list the module exports, so the test compares the code with itself.
- **Inputs off the boundary**: work out the inputs of a case whose name states a boundary ("closer than a gap", "just below the limit") and check they land there. On #488 a case named "closer than a gap" used boxes that overlapped, so the gap was never needed.
- **Weak matcher**: `toBeTruthy`, `toBeDefined`, `toContain`, `some(...)`, a length above zero, a wide `toBeCloseTo`, or `not.toThrow` alone, where the exact value is known.
- **Assertion that may not run**: `expect` inside a callback, loop or `if` that can be skipped, an empty case table, a `catch` that swallows.
- **Start equals end**: the state before the action already satisfies the assertion, so the action is not tested. On #449 focus started on the map region, which was also the fallback's answer.
- **Negative only**: "nothing happens" with no positive control through the same helper, so a helper that never fires the event passes (#447).
- **Wrong moment**: an accessibility scan or an assertion run after the state under test has gone (#449), or before an async step finished.
- **Mock instead of result**: a call count or a `vi.mock` of the project's own module, where a fake and an observable result exist (`design-tests` section 4).
- **Parser cases**: for code that reads text from outside, list from the format's own specification the valid forms it allows (spacing, case, legacy and modern syntax, every unit, percentages, keywords such as `none`, optional and clamped parts) and the invalid ones (`design-tests` section 6). Then run each form no case covers through the parser in a temporary test (section 4 says how) and report what it returns: a valid form misread, and an invalid form accepted, are both findings. On #463 this found `rgb()` channel percentages read as 0 to 100, hue units other than degrees ignored and `none` giving `NaN`.
- **Hand-rolled HTML or tag patterns** in a test or a check: CodeQL flags them as `js/bad-tag-filter` (#481). Parse, or match case-insensitively with tolerant whitespace.

## 3. Without the change

In the scratch worktree, put the changed code files back as they were at the base and keep the new tests: `git restore --source=<base> -- <changed code files>`. Leave out new files (they do not exist at the base, and their tests fail on the import, which proves nothing) and documents. Run the new and changed tests.

Each test written for the change should fail, for the reason its name gives. One that passes is either a guard (it keeps behaviour that already held, such as "leaves focus alone"): list it as a guard; or it claims the change and proves nothing about it: report it. Then `git restore --source=<head-sha> -- <the same files>` and check `git status` is clean.

For a refactor that claims no change in behaviour, a change made only of new files, or tests that fail at the base only because a name they use was renamed, skip this for those tests and say so; section 4 carries the weight.

## 4. Break it on purpose

Choose two to four mutations from the code diff, preferring the places a wrong value would ship silently:

- a threshold, limit or constant moved a little (4.5 to 4.0, `>=` to `>`, a length off by one);
- a factor or step dropped (an alpha, a unit conversion, a scale, a flattening);
- a branch removed or forced (delete an early return or a guard, replace a condition with `true`, return the fallback always);
- a reset removed (a flag that is set and never cleared, a listener never removed);
- an ordering swapped (two steps, a sort direction, which of two values wins);
- a member dropped from a list or a set the code checks against;
- the reading direction ignored (the right-to-left branch of a layout or a key always taking the left-to-right value);
- a parser rule loosened or tightened (accept an extra argument, drop a flag, refuse a valid form).

For each, one at a time: edit only code in the scratch worktree, with your edit tool, and check with `git diff --stat` that exactly one line changed; run the narrowest set that should catch it, then the package's tests; record killed or survived and the test that killed it; restore with `git restore -- <file>` and check `git status` is clean. A survivor is a finding. Write the smallest case that would kill it, run that case against the mutant in a temporary test file, then delete the file. If your case does not kill the mutant either, say "fix unproven" rather than offer it.

A survivor counts only if the mutated line runs. Coverage shows that for a line (`npx --no-install vitest run --coverage --coverage.include=<file> --coverage.reporter=text` in the package folder), but a covered line that no mutation can break proves nothing: the survivors are the measure, not the percentage. For a handler that runs only on an event, check a test fires that event.

Browser specs are slow and share a machine. First reason from the spec whether the case can tell the right path from the wrong one (section 2); run one spec only when that reasoning is not enough, on your own port (`MAPCAIRN_E2E_PORT`, see `playwright-tests`), with `--project=chromium`.

## 5. Flakiness

Look for each of these in the new and changed tests:

- a fixed wait (`waitForTimeout`, a sleep, `setTimeout` in a test), `networkidle`, or real timers where the code has a delay (`design-tests` section 5 has the clock helpers);
- an event triggered without waiting for the page to have handled it (#447);
- a test that relies on another test's state, on module state that is not reset, on a stubbed global that is not restored (`vi.unstubAllGlobals`, `vi.useRealTimers`), on the order of network requests, on `Date.now()` or randomness without a fixed value, or on a fixed port;
- a CI-only condition: a test that depends on `CI` or on a file another step writes, checked against the job order in `.github/workflows/` (#481, where the coverage run comes before the build).

## 6. A flaky test

When a test fails sometimes:

1. Reproduce: run it alone, repeated (in Vitest, the same `cd <worktree>/packages/<name> && npx --no-install vitest run <file>` call several times, one run per call, because the reviewer write guard refuses a shell loop; in Playwright `--repeat-each=20 --retries=0`, which is not on the guard's list, so the `test-reviewer` agent asks its caller to run it), then with others and under load (`--workers` raised). Note the rate and the first failing message.
2. Classify: timing (a wait or a timer), order (shared or leaked state), environment (load, port, browser or system difference), or a real bug in the app that only shows sometimes.
3. Fix the cause: pin the time, wait for the page's own state, isolate the state, give the run its own port, or fix the app. Never loosen the assertion, lengthen a timeout, add a retry or skip the test. A timeout that passes when the spec runs alone is a load flake (`pick-up-issue` section 5): say so, and leave the timeout alone.
4. Show the fix with the same repeated run, and file what you cannot fix with `create-issue`.

## 7. Clean up

Delete any temporary test file, check `git status` is clean, `git worktree remove .claude/worktrees/review-<n>`, and confirm with a port check that nothing you started is still running. If a restore fails or `git worktree remove` refuses on a dirty tree, report the path and its state under Deviations; do not use `--force` or touch other worktrees.

## Report

The report in `AGENTS.md` ("Definition of done"): **PR** is the pull request reviewed; **Checks** each command run and its result; **Seen** holds the findings, most serious first, each as `<path:line or path and test title> - what is wrong. Evidence: <the mutation or command and its result>. Fix: <the case to add, and whether it was run against the mutant>`, then the guards from section 3, then this table:

| Mutation | File:line | Result | Killed by |
| -------- | --------- | ------ | --------- |

**Deviations** says which sections were not run and why; **Issues to file** holds real work outside the change. Do not post on GitHub; the caller decides what to post.
