---
name: review-ui
description: "Review MapCairn interface code (React components styled with vanilla-extract tokens) against DESIGN.md and an adapted copy of the Web Interface Guidelines, and report terse file:line findings. Use when asked to review UI, check accessibility, audit design or UX, or check a component or pull request against the design system. It reads the code, not the screen: use visual-check to look at the running app."
---

# Review UI

`AGENTS.md` ("Definition of done") asks for this on every map or interface change, beside `visual-check`. The linters catch raw values; this review catches what they cannot: a missing label, a gesture with no keyboard route, motion that ignores reduced motion, a component that does not match its contract. It reads code. It does not tell you what the screen looks like, and it does not compute contrast: `packages/theme` tests do that, and `visual-check` shows the result.

The rules come from the Web Interface Guidelines by Vercel Labs (MIT), rewritten for React, vanilla-extract and this project's design system. `references/rules.md` has them, each with an id. The skill needs no network and no tool beyond reading files and running the repository's own linters, so every tool and model can follow it.

Example: asked to review a new panel component, run the linters, read the matching row in `DESIGN.md`, read the file against the rules, and report each gap as one line, such as `packages/map/src/panels/ExamplePanel.tsx:42 - A10 focus is not returned to the opener when the panel closes`.

## 1. Choose what to review

Use the files or pattern the person gave. For a pull request, take the changed `.ts`, `.tsx` and `.css.ts` files from `gh pr diff <number> --name-only` and read them with `git show <sha>:<path>` (never from a checked-out branch of a pull request from outside the project; see `land-pr` section 2). For a branch, `git diff --name-only origin/main`. With nothing given, ask which files. Skip tests, fixtures, generated files and the exempt surfaces listed in `DESIGN.md` ("Exempt surfaces").

## 2. Read the design first

Read the parts of `DESIGN.md` that match the change: "Principles" and "Tokens" always; "Layout and slots" for anything floating over the map; the row in "Components and accessibility contracts" for each component touched. Where a rule in `references/rules.md` and `DESIGN.md` differ, `DESIGN.md` wins, and say so in the finding.

## 3. Run the linters, and do not repeat them

Run `npm run lint:harmony` and `npx --no-install biome check <files>`. Report their failures once, as `lint: <message>`, and fix none of them yourself unless asked. Rules marked "(lint)" in `references/rules.md` are enforced there, so a clean run means they hold and you do not check them by eye.

## 4. Read the code against the rules

Go through the changed files and apply every rule that fits. A rule that does not apply (no forms in the file) is skipped without comment. Check the whole file, not only the changed lines, when the change adds a component.

Do not flag:

- a choice `DESIGN.md` makes on purpose, even if a general guideline would differ (for example the credits collapsing after five seconds, or a control disabled and not hidden);
- the items under "Left out on purpose" in `references/rules.md`;
- taste: names, structure or style that the rules do not cover.

## 5. Report

Group by file, most serious first within a file, one line per finding, in the form `path:line - rule id, what is wrong`. Add the fix only when it is not obvious. A file with no findings says `pass`. End with one line: the number of findings, and which files were not read and why. No preamble and no summary of what the code does.

```text
## packages/map/src/panels/ExamplePanel.tsx

packages/map/src/panels/ExamplePanel.tsx:42 - A10 focus is not returned to the opener when the panel closes
packages/map/src/panels/ExamplePanel.tsx:77 - M2 chevron rotation ignores reduced motion

## packages/map/src/panels/OtherPanel.tsx

pass

2 findings. Not read: none.
```

If a finding needs a decision (a rule that would change a design the maintainer chose), mark it `decision:` and leave it to them. When the review is part of a pull request, put the findings in the description under "Seen", not in a separate comment, unless the person asks otherwise.
