---
name: design-tests
description: "Design the tests for a MapCairn issue or plan before the code: which behaviour each test proves, at which level (unit, property, contract suite, component, browser, build output), with which fakes or test seam, how timing is pinned without sleeping, which test fails first and why, and what mistake each test would catch. Use when picking up an issue, when writing the Tests section of a plan, or when someone asks what to test or how. Writing and healing Playwright specs is playwright-tests; judging tests that already exist is review-tests."
---

# Design the tests

Test design for MapCairn. `pick-up-issue` starts with a failing test and `plan-change` has a "Tests" section; this skill decides what goes in them. Its output is a test plan for the issue or plan. `review-tests` checks the tests after they are written, and `playwright-tests` writes the browser ones.

Example: an issue adds a contrast check with a 4.5:1 pass condition. A plan that says "test a passing and a failing theme" would pass with the condition loosened to 4.0:1, as happened on #463. This skill asks for a pair on each side of every threshold (4.54:1 passes, 4.48:1 fails), so the loosened code fails a test.

## Inputs

- The issue with its acceptance criteria, or the plan, and who accepted it.
- The design notes and the states table, if `design-solution` or `design-ux` wrote them.

## 1. Read

1. `AGENTS.md` ("Browser tests", "Engineering principles") and `ARCHITECTURE.md` ("How tests substitute services", and "Ports" for the ports involved).
2. The tests that already cover the code: the `*.test.ts` and `*.test.tsx` files beside it, the contract suite of each port it uses (`packages/core/src/contracts`), and the specs in `packages/web/e2e` that drive it. Extend a test file before adding one, and reuse its helpers.
3. The documents and TSDoc that will describe the behaviour. Each sentence in them is a claim a test must be at least as strict as.

## 2. List the behaviours

Write one line for each acceptance criterion, each state from the states table, and each sentence a document will carry: "when <situation>, <observable result>". An observable result is something a person, a host or a later call can see: returned data, rendered text and roles, focus, an announcement, a request, a stored value, a file. A private variable or a call count on your own code is not one. A behaviour with no line here has no test.

## 3. Choose the level

Use the lowest level that can fail for the right reason, and one browser case per flow rather than per branch.

| Level        | Use it for                                                                                                    | Where and how                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit         | Pure logic: parsing, formatting, geometry, state machines, the contrast maths                                 | A `*.test.ts` beside the file, Vitest                                                                                                                                                          |
| Property     | A parser, encoder or round trip over input from outside (links, files, host data, provider answers)           | fast-check in `packages/core` only (it is core's dev dependency), with `PROPERTY_PARAMETERS`, the arbitraries and `failureOf` in `packages/core/src/propertyTesting`. Elsewhere, a case table |
| Contract     | What every implementation of a port must do                                                                   | The suite in `packages/core/src/contracts`, run against the fake and the real adapter                                                                                                          |
| Component    | A component or hook: rendered roles and names, focus inside the component, announcements, calls to a port     | Vitest with Testing Library, wrapped in `ServicesProvider` with fakes from `createFakeServices`                                                                                                |
| Browser      | Layout, Tab order across the page, real focus, the map engine, network failures, mirrored and translated runs | Playwright in `packages/web/e2e`, written with `playwright-tests`                                                                                                                              |
| Build output | Bundles, packed tarballs, generated files, CSP hashes, scripts in `scripts/`                                  | A test that reads the output (`packages/core/src/lint`, `packages/web/src/workerBundle.test.ts`) and skips with `describe.skipIf` when there is no build                                       |

jsdom has no layout, no real focus order across the page and no map canvas, so a claim about where something sits, what Tab reaches or what the map draws is a browser test. A browser test that only checks a pure result is a unit test in the wrong place.

A build-output test runs in CI only where a step runs it. Before a test depends on CI or on a file another step writes, read the job in `.github/workflows/` and check the order: on #481 a rule keyed on `CI` failed the build job, because the coverage run, where `CI` is already set, comes before the build. Name the step that runs the test in the plan.

A check that is itself the test (a release script leg, a lint script, a CI step) is unit-tested in its pure helpers, and its own failure path is shown once by hand: break its input, see the named failure, restore, and record it in the pull request, as #481 did with a renamed function in a copy of the built chunk. A leg that skips when its tool is missing is not a pass: say where a skip is a warning and where it must fail.

## 4. Substitutes

- Unit and component tests use the fakes in `packages/core/src/fakes`, not a `vi.mock` of a module the project owns. Add to a fake (and its own test) when it lacks a behaviour you need.
- Browser tests import `test` and `expect` from `e2e/fixtures.ts`, which mocks tiles, styles and the geocoders, and script services through the seam (`e2e/support/services.ts`: search, geolocation, clipboard, storage, theme, selection, a runtime catalogue). No test calls a third-party service.
- A new seam or fake is a design change: say so in the plan, with the contract suite that keeps it honest.

## 5. Time, events and order

- No sleeps. In Vitest use `vi.useFakeTimers()` and advance by the named constant from the code. In Playwright use `fastCredits` and `collapseCredits` (`e2e/support/states.ts`), or `page.clock.install()` and `page.clock.runFor(<constant> + TIMER_SLACK_MS)` with the constants in `e2e/support/timers.ts`. A new app timer gets a constant there, kept equal to the app's by a unit test.
- Wait for the page to have handled an event before you step past it: after `context.setOffline`, wait for `navigator.onLine` to change (#447). To show something did not happen, step the clock past it and wait two frames with `settleFrames`.
- Each test builds its own state. None depends on another test running first, on shared module state left by one, or on a fixed port.

## 6. Make each test able to fail

For each test, write the wrong implementation it rejects. If you cannot name one, the test proves nothing.

- Thresholds and limits: one case on each side of every boundary, as close as the values allow, and the exact boundary where the code says "at least" or "more than".
- Weights and factors: a case where dropping one (an alpha, a scale, a unit factor) changes the result.
- Branches: one case per branch that only that branch passes. A test whose starting state equals the fallback's result cannot tell the two apart: on #449 focus started on the map region, which was also where the fallback sent it.
- Ordering: a case where swapping two steps changes the output.
- Source: where the same result could come from somewhere else (a registry copy instead of the packed tarball, a cached file, a default), check where it came from.
- "Does nothing" cases are paired with a positive control through the same helpers, so a helper that never fires the event fails the pair (#447).
- Accessibility: run `axeViolations` (`e2e/support/a11y.ts`) while the state under test is on screen, not after it has gone (#449). Name the keyboard route and the announcement each flow is tested for.
- Hostile input, for anything that parses text from outside: empty, whitespace, wrong case, extra or missing arguments, out-of-range numbers, `NaN` and infinities, very long input, objects of the wrong shape or that throw when read. Valid input written every way the format allows (spaces or none, percentages, legacy and modern syntax) is hostile input too: #463 misread valid CSS.
- A regular expression on input from outside runs in linear time, and HTML is parsed rather than matched by a hand-rolled tag pattern, which CodeQL flags as `js/bad-tag-filter` (#481).

## 7. The failing-first test

Pick the one test that shows the issue is real. Say the command that runs it (`npx --no-install vitest run src/<file>` in the package folder, or `npm run test:e2e -w @mapcairn/web -- <spec>`) and the failure you expect: an assertion naming the wrong value. A test of a new export fails first on the missing export; add a stub that returns a wrong value and see the assertion fail too, so the test is known to check something. For a refactor with no change in behaviour, the failing-first test is replaced by the existing tests passing before and after; say which.

## 8. Output

Into the issue's design notes, or under "Tests" in the plan:

```markdown
### Tests

Fails first: `<file>` - "<test name>": <the assertion that fails today, and why>.

| Behaviour | Level | File | Substitutes and timing | Rejects |
| --------- | ----- | ---- | ---------------------- | ------- |

Runs in: <the CI job and step for each build-output or CI-dependent test, or "the usual unit and e2e jobs">.
Not tested, and why: <each behaviour left out, or "none">.
```

"Rejects" names the wrong implementation from section 6. A plan's "Order of work" says which step adds which rows. The issue's task list gets one box per test file.

## Do not

- Write the tests here (`pick-up-issue`, `playwright-tests`), or review tests someone wrote (`review-tests`).
- Plan a test on a private variable, a snapshot of a whole component, or a call count where an observable result exists.
- Plan a sleep, a `waitForTimeout`, `networkidle`, a retry or a longer timeout to make a case pass.
- Post on GitHub unless the person asked; put the plan in your report.

## Report

The report in `AGENTS.md` ("Definition of done"): **PR** is the issue or plan; **Checks** "none, no code" unless you ran something; **Seen** holds the test plan; **Deviations**; **Issues to file**.
