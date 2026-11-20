---
name: review-docs
description: "Check that MapCairn documents are true: every named command, file, export, token, route, setting, number and behaviour verified against the code, no planned feature described as existing, documents that mirror each other in step, and the project's writing rules. Use when asked to review or audit documentation, for any pull request that changes Markdown or a skill or agent file, and before a documentation change merges. It reads documents against the code; review-ui reads interface code, and land-pr covers the pull request itself."
---

# Review docs

`AGENTS.md` ("Boundaries") requires the documents to change with the code. This review asks the other question: is what a document says true? Reviewers have found a guide that named two unit tables as persisted settings keys, a description that called a whole build output identical when only the stylesheets were, and a sentence that overstated what a test checks. A script finds references that point at nothing; the rest is reading each claim against its source.

Example: a guide says the host keeps the unit choice under a named storage key. Search the code for that key, read where it is written and read, and if it differs report one line giving the guide's line, the key the guide names, and the key and file the code uses.

## 1. Choose what to review

Use the files the person gave. For a pull request, take the changed documents from `gh pr diff <number> --name-only` and read them with `git show <sha>:<path>` (never from a checked-out branch of a pull request from outside the project; see `land-pr` section 2), and read the changed code in the same diff, because a document is true or false against the code at that head. For an audit, take every tracked document except the generated copies (`.agents`, `.codex`, `.opencode`, `.qwen`, `.github/agents`) and `packages/*/api`.

## 2. Run the mechanical check first

Run `node scripts/agents/docs-refs.mjs <files>`. It prints each file or folder in backticks, relative link and `npm run` script that does not resolve, as `file:line - reference`. It cannot tell a typo from a path that is planned or lives in another tool's folder, so read each hit: a plan may name what it will add, `docs/guides/working-with-agents.md` names folders other tools read, and `docs/guides/public-api.md` names a stylesheet by its export name, `theme/tokens.css`. Then `npm run lint`, which checks formatting, the agent copies, the roadmap links and the names list. Report each real hit once and do not repeat the rest of the lint.

## 3. Verify every claim against its source

Read the document line by line. A sentence that states a fact is checked in the file that owns it, and the report names that file. Where to look:

| The document names                       | Check in                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| a command or script                      | `package.json` of the root and the workspace; read what the script runs            |
| an export or a prop                      | `packages/*/api/*.api.md`, then the source for its behaviour                      |
| a token, colour or size                  | `packages/theme/src/tokens.css.ts` and `tokenValues.ts`                           |
| a route, header or origin                | `packages/web/src/routes.ts`, `public/_headers`, `src/constants/securityHeaders.ts` |
| a setting, storage key or default        | the adapter and its test; the default is in the code, not the label               |
| a number, limit or timeout               | the named constant; a figure with no constant behind it is reported                |
| a layer, provider or basemap             | its definition under `packages/web/src/layers/definitions` or `packages/core/src` |
| a licence                                | the package `LICENSE`, `scripts/sdkLicences.allowlist.json`, `ATTRIBUTIONS.md`    |
| a CI check, workflow or job              | `.github/workflows`                                                                |
| what a test or a check proves            | read the test: a claim about what it covers must match its assertions             |

Treat these words as claims to count, not as style: "all", "every", "none", "only", "identical", "always", "never", "the same as". Find the cases that would break each.

## 4. Check documents against each other and against the plans

- `PRIVACY.md` mirrors the privacy page (`packages/web/src/app/PrivacyPage.tsx`, with its text in the `privacy.*` catalogue entries). `PrivacyPolicyFile.test.tsx` compares the two, so run it and then read what a test cannot judge: that each provider, kind of data and retention the code now sends or stores is named in both. Report a difference as a pair of lines.
- A feature described in the present tense must exist in the code. Read `docs/plans/` for the feature's status: a planned feature written as built is a finding, and a plan whose work has shipped and still says "planned" is one too.
- A list in two places (the skills and agents in `AGENTS.md`, `CLAUDE.md` and `docs/guides/working-with-agents.md`; the packages in `README.md` and the package READMEs; the layers in `ATTRIBUTIONS.md`) lists the same members.
- `ROADMAP.md` names milestones that exist (`npm run roadmap:check`). A number or name repeated in `README.md`, `ARCHITECTURE.md` or a guide agrees with the owner of that fact.

## 5. Check the writing rules

Apply the rules in `AGENTS.md` ("Conventions") to the changed text only: British English, sentence-case headings, plain specific prose with no puffery, no em dash used as the default connector, no assistant attribution, no maintainer name, no commercial comparison. Do not add a second style guide and do not rewrite for taste.

## 6. Report

One line per finding, most serious first, in the form `path:line - what the document says, what the source says (file checked)`. Mark a claim you could not confirm as `unconfirmed:` with what you searched, and a choice that is the maintainer's as `decision:`. A document with no findings says `pass`. End with one line: the number of findings, the documents read and any not read. No preamble. A review inside a pull request goes under "Seen" in the description unless the person asks otherwise.
