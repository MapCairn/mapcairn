---
name: web-platform-guidance
description: "Look up modern HTML, CSS and browser API guidance before writing interface code in packages/map or packages/web that a native platform feature could replace, such as dialogs, popovers, menus, anchor positioning, view transitions, scroll behaviour, forms and focus. Runs a pinned local copy of the Chrome team's guides, offline, with usage reporting off. Use when building or changing such a component. Skip map engine code, adapters, tests, build config and copy."
---

# Web platform guidance

Models write older browser code than the platform now needs: a hand-built dialog, a scroll listener, a polyfill. The guides here say what the current native answer is and which fallback it needs. This skill is for interface code; `review-ui` reads the result against `DESIGN.md` afterwards, and `visual-check` looks at it.

The guides come from the `modern-web-guidance` package of the Chrome team (Apache-2.0), pinned in the root `devDependencies`, and the procedure is adapted from the skill that package ships. The credit is in `ATTRIBUTIONS.md`. The skill needs no network and sends nothing: `scripts/agents/web-guidance.mjs` runs the installed copy with the package's usage reporting switched off (the package's own command line would send the search text to its publisher). Do not run `npx modern-web-guidance` or any command of the package beyond `search`, `list` and `retrieve`; the wrapper allows only those three, and a version bump goes through the dependency rules in `AGENTS.md`.

Example: asked to make the shape list close when the user taps outside it, search `light dismiss popover`, retrieve the guide it names, use the native `popover` attribute it describes, and write the colours, spacing and motion from the tokens, not from the guide's sample CSS.

## 1. Decide whether it applies

Use it before you write or replace code in `packages/map` or `packages/web` that does one of these:

- an overlay: dialog, popover, menu, tooltip, drawer
- positioning one element against another, or a transition or animation between states
- scrolling: snap, scroll-driven effects, scroll locking, scrollbars
- forms, validation, autofill or input modes
- focus handling, keyboard routes or a native control with a modern replacement
- responsive layout that a container query would solve, colour handling, or loading and performance hints

Skip it for the map engine and its adapters, ports and pure logic in `packages/core`, tests, build configuration, copy and anything that is not browser interface code.

## 2. Search

```bash
node scripts/agents/web-guidance.mjs search "<query>"
```

Use two to five words that name one capability or interface pattern: `light dismiss dialog`, `responsive data table`. Name the interface primitive the task implies (a request to "confirm first" searches `confirmation modal dialog`). Leave out framework names, product words and file names, and split a task with several capabilities into several searches. The result is a JSON list of `id` and `description`: judge by the descriptions. With no match, rephrase once with the concrete element name (`dialog`, `popover`, `table`, `form`), and if nothing fits, go on without a guide. `node scripts/agents/web-guidance.mjs list` prints every id, for a broad look.

## 3. Retrieve

```bash
node scripts/agents/web-guidance.mjs retrieve "<id>,<id>"
```

Retrieve the guides that match the task, and the broader guide for the area when one applies: `html`, `css`, `accessibility`, `performance`, `security` or `privacy`. When the output is long the command line saves it to a temporary file and prints the path: read that file in full with your file-reading tool, in more than one read if needed, and do not cut it short with `head`. If a retrieve returns a notice about an origin trial or volatile feature guide instead of a guide, do not opt in (the wrapper refuses `set-allow-*`): use a cross-browser approach and say so in the pull request line.

## 4. Adapt it to MapCairn

The guides use plain HTML, CSS and JavaScript and assume nothing about this project. Where a guide and these rules differ, these win:

- **Tokens only.** Colours, spacing, sizes, durations and stacking come from the tokens in vanilla-extract `.css.ts` files, never from the guide's sample values (`DESIGN.md`, "Tokens"). The harmony scanner fails a colour literal and an off-scale radius, spacing, font size, weight or motion duration.
- **Logical properties and `[dir="rtl"]`.** Write `marginInlineStart`, not `margin-left`, and do not use `:dir()`: the build rewrites it, so `DESIGN.md` says to use the attribute selector.
- **Motion.** Only `transform` and `opacity` animate, at the token durations, and `prefers-reduced-motion` turns motion off.
- **Copy.** Interface text comes from the message catalogue by key, not from a guide's sample strings.
- **No Shadow DOM component libraries.** Such a library, `@material/web` for one, fails under Workers SSR (`AGENTS.md`, "Design system"). A guide that suggests one is a hint to use the native element instead.
- **Server rendering.** Guard `window`, `document` and `HTMLElement` and start browser-only work in an effect. Give each component instance its own ids and anchor names (`useId()`). A newly shipped attribute that React's types do not know takes a typed spread or cast on the element, not a removal of the attribute.
- **Content Security Policy.** The production policy permits no `unsafe-inline` script or style source (`AGENTS.md`, "Web host and deployment"): an inline script needs a hash in `public/_headers`, and a script comes from the site itself, so a guide's inline snippet or hosted polyfill becomes code in the repository.
- **Fallbacks and browser support.** The guides treat a feature that is Baseline widely available as safe without a fallback, and ask for the guide's fallback for anything newer. The project's policy is the same and is in `CONTRIBUTING.md` ("Conventions"): follow it, keep a fallback small, feature-detected and free of new dependencies, and check the feature in WebKit as well as Chromium, because iPhone WebKit is one of the Playwright projects. A new runtime dependency is a maintainer decision (`AGENTS.md`, "Ask the maintainer first").
- **Accessibility and boundaries.** Keep the keyboard route, visible focus and single-tap equivalent that `AGENTS.md` asks for, and keep browser APIs behind the layers `ARCHITECTURE.md` describes. `packages/core` imports no browser global, and outside the adapters and the tests Biome denies the bare `fetch`, `matchMedia`, `localStorage`, `sessionStorage`, `location` and `history` (`DESIGN.md`, "What the lint checks, and where"), so a guide's sample that uses one goes behind a port or an adapter.

## 5. Check and report

Read the finished code once against each retrieved guide: the modern pattern is used, its fallback is present where the guide requires one, and nothing the task did not ask for was added. Then run the usual checks.

In the pull request description, add one line for each guide that shaped the code: its id, what it changed and the pitfall it avoided. If you searched and no guide applied, say which topics you searched.
