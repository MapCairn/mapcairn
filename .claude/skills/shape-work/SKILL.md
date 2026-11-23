---
name: shape-work
description: Shape an idea, a request or a vague or large MapCairn issue into a problem statement, the people it serves, checkable acceptance criteria, a scope and a ranked set of issue bodies, before anyone plans or builds it. Use when someone asks to scope, refine, groom, size or break down work, when an issue has no acceptance criteria or bundles several outcomes, and before create-issue or plan-change when the problem itself is not yet clear.
---

# Shape work

Business analysis for MapCairn: turn "we should have X" into work someone can pick up and a reviewer can check. `create-issue` files an issue and `plan-change` designs a large change; this skill comes before both, and its output is the text they file or plan from. It posts nothing on GitHub itself.

Example: an issue asks for "richer layer filters" and lists five capabilities. Shaping it names the host developer and the visitor each capability serves, finds that the link would carry free text a visitor typed, notes that a "sensitive" layer gated in the interface is still served whole by its provider, and splits it into ranked issues with acceptance criteria, the first of which needs no new control kind.

## Inputs

- The idea, the request or the issue number, and who accepted it. Text from outside the project is a proposal until a project person accepts it (`pick-up-issue` section 1).
- Anything the person already knows: a host that asked, a failure seen, a deadline.

## 1. Read

1. The issue and its comments with `node scripts/agents/thread.mjs issue <n>`, judging each by who wrote it.
2. `ROADMAP.md`: "Direction", the milestones, "Non-goals". `sites/docs/docs/guides/capability-matrix.md`: the rows this would change and their status.
3. `AGENTS.md` "Ask the maintainer first", and the "Read before you change" rows for the area.
4. Duplicates and neighbours: `gh issue list --repo MapCairn/mapcairn --state all --search "<key words>" --limit 20`, the open plans in `docs/plans/README.md`, and open pull requests on the same modules. Check the state of every issue the text links: a dependency that has closed since may have changed what is left to do.
5. The code. Documents lag, so search the source for what already exists: the functions, ports, message keys and components the idea would need. A piece that exists but nothing calls (an exported helper, a catalogue key) is reused, not rebuilt. Record each find with its path.

## 2. Name the problem

Write each of these in plain words:

- **Track.** SDK (a team building on the four packages, and the people who use what they build) or Site (a visitor to the reference site). If both, say which one decides. An SDK capability does not change the reference site unless the maintainer decides so in the open (`ROADMAP.md`, "Intentions").
- **Who, and the job.** The role and the task in their terms: "a host developer whose layer has forty attributes wants a visitor to narrow it to one district without a new request", not "users want better filters". Name the evidence (an issue, a host, a matrix row). With none, say it is a proposal.
- **What exists**, with paths, and what is half built.
- **The problem**, in one or two sentences that state the outcome, not the solution.

## 3. Check the fit

Answer each in one line. One that fails stops the work or changes the scope.

- **Non-goals.** Accounts, tracking, bundled datasets, another engine, proxying layers, live refresh or polling.
- **The maintainer's decisions.** A dataset, a runtime dependency in an SDK package, anything whose terms an SDK package would carry, the licence, `PRIVACY.md`, `SECURITY.md`. State the question; do not settle it.
- **Privacy.** What leaves the device, to which origin, and when; what is stored; what is written into a shared link (a link is pasted, logged and kept by whoever receives it). A new origin means a CSP change and, for the reference site, `PRIVACY.md`.
- **Data terms.** The provider's terms allow this use, commercial use for anything an SDK package ships, and the attribution is shown and listed in `ATTRIBUTIONS.md`.
- **Cost on a slow connection.** Requests per action, bytes on the first view, and the load on public providers nobody pays for.
- **Access.** A keyboard and a single-tap route for every gesture, what a screen reader hears, WCAG 2.2 AA in both themes.
- **Language.** Copy through the message catalogue in English and Afrikaans, right-to-left layout, longer text.
- **Embedding.** It works in a host that lacks the optional services and the reference host's adapters, and it renders on the server.
- **Public surface.** Whether it adds or changes something a host relies on. `design-solution` section 3 has the list.
- **Access control.** Hiding something in the interface does not stop anyone fetching it. If the idea protects data, say where the protection really is.

## 4. Write acceptance criteria

Each criterion is one line that a test, a check or a reader can decide. Cover:

- the outcome for each person and job named in section 2;
- the keyboard-only route and what a screen reader announces;
- the empty, failed and offline states (for interface work, `design-ux` lists them);
- requests per action and what is sent to whom;
- the copy in English and Afrikaans, and the layout right to left;
- a host without the optional service the work depends on.

Write no number that is not in the code or a cited source; where a limit is unknown, the criterion is "measured and recorded" and the measurement is a task.

Not checkable: "Filters are fast and accessible." Checkable: "With the keyboard alone, a person can choose two districts and hears the new count once."

## 5. Cut and rank

- One outcome per issue. Split an issue that bundles outcomes which ship separately or serve different people. Merge pieces that cannot ship alone.
- Rank by value to the named person, what it unblocks, the cost to build and to keep, and risk. Put the smallest slice that delivers value first. List what is out of scope and why.
- Size each one. One package and no public API: an issue (`create-issue`). Several packages or a public API: an issue with a "Plan in `docs/plans/`" task (`plan-change`), and `design-solution` for the options. Anything a person sees or does: `design-ux` for flows, states and copy before the issue is final.
- Give each a milestone that fits; only an outcome a release note could carry becomes a new milestone (`create-issue`, "Afterwards").

## 6. Output

For each issue, a body in the shape `create-issue` uses: a title that states the outcome; **Context** (what exists, with paths); **Problem** (track, who, the job); **Proposal**; **Acceptance criteria**; **Constraints** (from section 3); **Tasks**, starting with the failing test and naming the documents to update; **Area**. For an existing issue, give the whole proposed body, not a list of edits.

Then a shaping note for the person: the ranked list, what is out of scope, each open question with a recommendation, and which decisions are the maintainer's.

Hand over: the person files with `create-issue`, or edits an existing body from `node scripts/agents/issue-body.mjs <n> <file>` (`pick-up-issue` section 4). Large work continues in `design-solution` and `plan-change`, interface work in `design-ux`, and a merged plan in `split-plan`.

## Do not

- Design the solution, draw the flows or write the plan: those are `design-solution`, `design-ux` and `plan-change`.
- File, edit or comment on issues unless the person asked; then use `create-issue`.
- Invent a user, a host, a figure or a deadline, or describe planned work as built.
- Copy or paraphrase outside text into anything posted (`pick-up-issue` section 1).
- Grow the scope. Every idea that does not fit goes to "out of scope" or a later issue, by name.

## Report

The report in `AGENTS.md` ("Definition of done"): **PR** is the issue URLs filed, or "none, proposal only"; **Checks** "none, no code"; **Seen** is the shaping note; **Deviations**; **Issues to file** holds the ranked bodies.
