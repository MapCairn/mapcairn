---
name: design-solution
description: Weigh the design options for a MapCairn change against ARCHITECTURE.md, record the choice in a short decision record inside the issue or plan, and review a design someone else wrote for boundary, public surface, migration, privacy, security and performance risk. Use when a change has more than one reasonable design, before or while writing a plan with plan-change, when someone asks how to architect, structure or design something, and to review a plan or the design in a pull request.
---

# Design a solution

Solution architecture for MapCairn. `plan-change` writes the plan; this skill decides what goes in its "Design" and "Decided and open" sections, and checks a design before anyone builds it. For a change that needs no plan, the same record goes in the issue's design notes. There is no separate folder of decision records: plans are deleted when their work is done, so a decision that still governs the code moves into `ARCHITECTURE.md`, `DESIGN.md` or a guide in the pull request that finishes the work.

Example: a plan ships compiled CSS and checks its public API with an API report of the TypeScript declarations. Section 3's public surface list asks for every styling hook a host relies on, and finds that the custom property names are generated hashes that change between builds, while a planned host theming feature would set them.

## Inputs

- The shaped problem: the issue with acceptance criteria (`shape-work`), or a plan or pull request to review.
- Who accepted the work, and any decision already recorded on the issue.

## 1. Read

1. The "Read before you change" rows of `AGENTS.md` for the code involved, then those sections of `ARCHITECTURE.md` (and `DESIGN.md` for interface work).
2. The code each option would touch, not only the documents about it. Check that every file, symbol, script and command you will name exists and works as you will say.
3. `sites/docs/docs/guides/extending.md` for what hosts are told today, `sites/docs/docs/guides/capability-matrix.md` for the row, `ROADMAP.md` "Non-goals", and the open plans and pull requests on the same modules.

## 2. List the options

Write at least two. One is always the smallest change that meets the acceptance criteria: reuse what exists, change a definition instead of code, or leave it to the host through a port it already has. For each: what changes (packages, ports, files), the public API in outline, and the cost to build and to keep.

## 3. Check each option

Go through every line. Write "n/a" with a reason rather than skip one.

**Boundaries**

- Where each new piece lives in the layer table: core touches no DOM, React, engine, browser global or clock; the ui never imports an adapter or the engine; only the composition root imports adapters.
- A new port only where there are two implementations, counting the fake; with its fake, its contract suite, typed errors and an `AbortSignal` on every async call. An optional service leaves the ui working without it; host-owned data goes in `HOST_SUPPLIED_PORT_NAMES`.
- Added as a definition, an adapter or a module. Nothing switches on a layer, basemap or provider id, or on a kind name.
- Server rendering: the code runs on the server with no `window`, holds no module-level service, and hydrates to the same markup.
- A host that is not the reference site: `examples/embed`, through public entry points only, still builds and works.

**Public surface.** List every surface the option adds, changes or removes. Each is a contract with hosts or with people's devices and links.

- Exports of each entry point, and port interfaces: a new required method breaks every host's adapter, so add an optional member or a new port. A new member of an exported union, such as an error kind, breaks a host's exhaustive `switch`.
- Formats that outlive a release: the URL hash and shared links, settings keys and values on devices, export and import files, any encoded text.
- Data hosts write: definition schemas, runtime catalogue responses, language catalogues (a new message key needs a value in every host catalogue).
- Styling and markup a host may target: CSS custom property names, class names, slots and props, `data-testid` values, announced text.
- For each: the semver effect (on `0.x` a breaking change is still labelled with `!`), what a host changes, as Before and After, and whether the old form can be read for a while.

**Qualities**

- Privacy: what leaves the device, to which origin, what is stored, what goes into a link. A new origin needs the reference host's CSP (`packages/web/public/_headers` and `packages/web/src/constants/securityHeaders.ts`), a line in `sites/docs/docs/guides/content-security-policy.md` for other hosts, and `PRIVACY.md` for the reference site (the maintainer's).
- Security: untrusted input (provider responses, files, links, host data) validated at the boundary and read in bounded, linear time; requests only to `https` origins the definition declares; no inline script or style, no `eval`.
- Performance: what the first view loads and what can load later, requests per action, work per frame, the largest count of features or shapes. Measure, do not guess (`sites/docs/docs/guides/performance.md`, "Ground rules").
- Licensing: a new runtime dependency in an SDK package is the maintainer's call and must pass `npm run licence:sdk`; a provider's terms and attribution.
- Failure: each async call's error kinds, cancellation, and a retry only when the person asks.
- Language: copy as catalogue keys, logical properties, foreign text isolated.
- Tests: what the fake and the contract suite prove, and what only a browser test can.

## 4. Decide and record

Choose the simplest option that passes section 3. Record it in this shape, in the issue's design notes, or in the plan ("Design" holds the options, "Decided and open" the decision):

```markdown
### Decision: <title in sentence case>

Status: proposed | decided on <date>, by <role>, in <issue or pull request>.
Context: the problem in one or two sentences, with the issue.
Options: 1. <the smallest>, what it costs and where it fails. 2. <the next>, the same.
Choice: <option>, because <the reason, tied to a check in section 3>.
Public surface: each surface added, changed or removed, its semver effect and migration, or "none".
Consequences: what gets easier, what gets harder, what it costs to keep.
Revisit when: <an observable trigger, such as a second implementation or a measured limit>.
```

A choice that is the maintainer's stays "proposed", with a recommendation and its cost. Write the decision in its final wording, the sentence a document will carry.

## 5. Review a design you did not write

The `architecture-reviewer` agent runs this; anyone may. Read the design as a stranger: the plan on `main` or the pull request's head with `git show <sha>:<path>`, never a checked-out branch from outside the project (`land-pr` section 2). Then:

1. Check every file, symbol, script, command and version the design names, in the code or its source.
2. Check the steps build in the order given, each step's needs have a supplier, and each ships with the build green.
3. Run section 3 against the chosen option.
4. List every persisted, shared or host-written format and every styling or markup hook the design touches, and check it says how each one is versioned. A missing one is a finding.
5. Check the smallest option was weighed, and each rejection has a reason that holds.
6. Check each risk has a containment, no figure is invented, nothing planned is described as built, and "Documents to update" is complete.

Report one line per finding, most serious first (blocking, should fix, minor): `path:line - what is wrong. Fix: what to change.` Mark a finding that needs the maintainer `decision:`. With none, say what you checked.

## Do not

- Write the rest of the plan (`plan-change`), cut it into issues (`split-plan`) or start code.
- Add a port with one implementation, an extension point nobody asked for, or a folder for decision records.
- Settle an "Ask the maintainer first" item.
- Post a review on GitHub unless the person asked; put it in your report.

## Report

The report in `AGENTS.md` ("Definition of done"): **PR** is the plan, issue or pull request; **Checks** "none, no code" unless you ran something; **Seen** holds the decision record, or the review findings; **Deviations**; **Issues to file**.
