# 0019: Move the map interface to Lit, behind one element

Status: proposed. Tracking issue: [#1015](https://github.com/MapCairn/mapcairn/issues/1015).

## Goal

A host places one element, `<mapcairn-map>`, from any framework or from plain JavaScript. It passes services and settings, listens to events, and puts its own content in named places. The interface inside is written in Lit and is private. 0.3.0 is the first release with it.

## Ground rules

- `main` deploys on every merge, so each step leaves the reference site complete.
- `lit` is the only new runtime dependency of an SDK package. `@lit/react`, `@lit/context` and an icon runtime are not used.
- The interface stays in the page's DOM, with no shadow root, for the reasons in `ARCHITECTURE.md` ("The browser route's design").
- Ports, `core`, `theme` and the MapLibre adapter keep their boundaries. `core` gains no DOM, clock or browser global.
- The deprecation notice period is waived for this move only (#1015). Each pull request that removes an export has `!` in its title and a `BREAKING CHANGE:` footer that names the replacement and the waiver.

## Design

### Boundary first, rewrite second

The public boundary changes while the inside is still React, and the inside is rewritten afterwards: the element moves into `map`, gains what the reference host needs until the host uses only it, the public React exports are removed, and then the inside, which has no outside user by then, is rewritten in Lit from the leaves to the containers. A React part may render a Lit element; a Lit element never renders React. Step numbers below are those of "Order of work".

The browser specs then run against the final boundary through the whole rewrite, and no temporary React wrapper is ever public. Rewriting leaves first with exported wrappers was rejected: it keeps about 300 public exports (164 of them values) working while their insides change, and removes them all at the end.

Also rejected, by decision (#1015): public elements for each building block, and a public element for every component. Both keep a large API stable for hosts that want their own arrangement. Such a host builds on `core` and the MapLibre adapter.

### What the element offers

The exact names are settled in steps 4 to 9, each with its API report. The outline:

- **Services.** The whole of `Services` (`core`'s `ports/services.ts`) can be passed as a property. `packages/map` imports no adapter and no browser service, so every default that is one stays in `sdk/src/browser`: the MapLibre adapter, `BrowserThemeSource`, `BrowserDevicePreferences`, `BrowserFileSaver`, the English messages, the in-memory settings and address state, and the fakes for ports the interface never calls. The element that `map` defines waits for `services` before it draws. The bundle hands its defaults to the definition. A page that gives both plain-data `layers` and a layer catalogue in `services` gets a `MountMapError` that names the fix.
- **Behaviour.** What `useMapApp` and `AppChrome` do in the host moves into one private controller in `map`, starting from `core`'s `surfaceReducer`. It is plain TypeScript with `getState` and `subscribe` from its first step, so it is written once: the React interface reads it with `useSyncExternalStore`, and the Lit interface through a reactive controller. `MountedMap` and `MountedChrome` merge into it.
- **Language.** What `activeMessages.tsx` does (resolve the language, load a catalogue lazily, report a failed load and retry) becomes a framework-neutral store in `core`, built from `Services`. A host makes one, uses it for its own pages, tab title, page language and the text it passes to the element, and hands it to the element. Without one, the element makes its own.
- **Host content.** Text and links are plain data: notes (privacy, routing, pin lookup), the about links in Help, the link in the credits, tour steps and the notice when the map cannot start. The one place that takes markup today is the brand in the sheet. It is a stable container node that the element creates when constructed and exposes as a property, which React fills with a portal and any other page with `append`. A cloned `<template>` was weighed and refused, because a framework could not keep it up to date. A further container is added only for content that data cannot carry. The element never moves a host's own nodes, and a framework never renders children into the element.
- **Page structure.** A host can give the id of the map region, so a skip link rendered on the server has its target before the map exists, and chooses whether the element draws the `main` landmark. The ids that link parts inside the element are its own.
- **Provider credits.** The routing port gains an optional credits member, shown while a route or area is drawn, as the host's `routingCredits` are today, so moving directions cannot drop a credit a provider's terms require.
- **Events and handle.** The four `mapcairn-*` events, plus what the host and `examples/embed` read today: layer state and actions, the selected features, and what the WebMCP tools need. State is read through stores with `getState()` and `subscribe(listener)`, the shape of the layer catalogue. In React, `defineMapElement` runs before the first render, so React sets properties and not attributes.
- **WebMCP.** `map` exports a framework-neutral `registerModelContextTool(definition)` that returns an unregister function, with the model context types. The host and the example wrap it in a few-line hook.
- **Server rendering.** The element draws only in a browser, and importing `map` on a server works. Lit's browser build extends `HTMLElement` when it is loaded, so step 2 proves the import in plain Node, in the Workers build and in a server bundle that takes the browser condition. Where one fails, Lit is loaded inside the definition function. `ChromeSkeleton` becomes a pure function that returns the skeleton's HTML with its copy escaped, which any server can send.
- **The host's other pages.** The product, privacy and error pages and the server part of `/map` stop using `ServicesProvider`, `LiveRegionProvider`, `SkipLink`, `VisuallyHidden`, `Button` and `Icon`. The host gets its own small versions, reading the message store, with its own announcer. The harmony scanner's lists of files allowed to hold each pattern, and the icon mirroring rule, gain those host paths with their own planted failures.
- **Two entries on one page.** `map`'s definition needs `services`; the bundle's draws with defaults. Their functions have different names, and a page that registers both gets an error naming the two entries, not whichever came first.

`@mapcairn/map` then exports its definition function, the element and event types, the store types, the model context registration, the skeleton function and the stylesheet. Ports, domain types and the message store come from `core`. `@mapcairn/sdk/browser` keeps `mountMap`, `defineMapElement` and the element, bundled with defaults.

### Packages

- `@mapcairn/react` is removed in step 12. Its `useReadingDirection` and `useLatestRef` are internal needs; the host keeps its own copy of what it uses. The release set becomes five packages. 0.2.0 stays on npm, and marking the old package deprecated there is a maintainer step.
- No wrapper package for any framework. React 19 sets properties on custom elements and listens to their events, so the package ships JSX typings, as `@mapcairn/sdk/browser/react-jsx` does now.
- #1014 (a package of its own for the browser route) is closed as superseded: its reason is the React peers, which step 18 removes from `sdk` and `map`. `maplibre-gl` stays a peer.

### Inside the element

- **Reactive properties** use `static properties` with `declare` fields set in the constructor, and no decorators. The base `tsconfig` keeps class fields on, where a plain field would hide Lit's accessor.
- **Light DOM.** `createRenderRoot()` returns the element, so Lit's `static styles` are not used and the vanilla-extract stylesheet ships as it does now.
- **CSP.** No `style` attribute binding in a template: the production policy is `style-src 'self'`. Computed styles are set through `element.style.setProperty`.
- **Wiring.** A parent hands each private element the controller or the values it needs as properties. There is no context lookup. Each map makes one id prefix, from a counter and a random suffix, for `aria-controls` and label ids.
- **Registration** is by function, never on import, except the existing `browser-element` entry. While React renders a private element, the React part calls its definition function on the client.
- **Two copies on one page.** Element names are global to a page. A private element of one copy must never run another copy's class. Step 2 chooses how (private names that carry a per-copy suffix, or no custom element where a template function is enough) and proves it with a test that loads two copies.
- **Replacing Radix.** The switch is a checkbox with `role="switch"` and the slider a range input. The segmented control stays `radiogroup` and `radio` on buttons with roving focus: arrow keys move, and Space or Enter chooses, as today. Native radio inputs would choose on each arrow press, which would load a language or redraw the map on the way past. `Tooltip` is deleted: no SDK component renders it.
- **Icons** are Phosphor SVGs taken at build time from a development dependency, with its licence in the notices. The Biome restriction on that package is narrowed for the build step only. The reference host keeps `@phosphor-icons/react` for its own pages.

### What must not change

The browser specs hold these through every step: accessible names and roles, keyboard behaviour and focus return, announced text, `data-testid`, `data-chrome` and `data-state`, the `aria-controls` link from the end stack to the sheet, two maps on one page with distinct ids and landmarks, and no inline style or script under the strict policy. Saved and shared formats are read and written unchanged: the shared-link hash (view, basemap, layers), the saved last view, the basemap choice and `tourSeen` with its version. The host's specs for each move with the behaviour.

Known changes to specs: `theme-override` loses its tooltip tests and `a11y` its tooltip test, because the component is removed; the rest of `theme-override` stops selecting Radix's popper; `app-shell` stops matching React hydration errors; `design.spec.ts` and the design guide's two-map demo are rewritten in step 11.

**Component states.** Today the design guide shows every primitive in every state, and its specs check keyboard reach, focus rings and forced colours. The primitives become private, so those checks move to a fixture page built inside `packages/map` for tests only, with its own Playwright project, in step 11. It is not exported. The reference site's design guide keeps the tokens and shows the element.

## Tests

- Step 1 starts with a planted failing case for each guard: inline English in a Lit template, a raw colour in a template, a `style` binding, and an icon-only button with no name.
- Step 2 starts with failing tests for the first element's keyboard behaviour and name, for a property set after construction re-rendering it, for two copies on one page and for the server imports. The strict-policy legs in `scripts/release/bundleRun.mjs` collect violations over it, with one planted `style` binding shown to fail. A server render and hydration of the product page and the Workers leg of `consumer:check` must pass.
- Behaviour that moves from the host into the controller has the host's cases, written against the controller first.
- Each rewrite step replaces that area's React Testing Library tests in the same pull request. Pure logic moves to plain modules with their tests first. The coverage floors do not change and nothing new is excluded.
- **Size.** Measured with the pack check's rule and the consumer check's first-load rule before step 1 and after steps 2, 7, 12 and 18. The bundle carries React and Lit until step 18, so step 1 raises `BUNDLE_CEILINGS` and the consumer check's `client` and `FIRST_LOAD_BUILD` figures as far as measurement shows is needed, and step 18 sets each below its figure of today.
- **Speed.** Following "Ground rules" in `performance.md`, step 1 records first render and the time to open the sheet and turn on a layer under CPU throttling, and the same is measured after steps 12 and 18.

**What stops the move.** Any of these goes to the maintainer before more is ported: a WCAG 2.2 AA behaviour that the Lit element cannot match; a strict-policy violation with no CSSOM route around it; focus or a first announcement lost to asynchronous rendering with no reliable fix; a server import or render that cannot be made to work; or, once React has gone, a first load or a throttled timing worse than today's.

## Order of work

Each step is one pull request or a short run of them, with the build green.

1. **Groundwork.** `lit` in `map` (`licence:sdk`); copy check and harmony scanner read Lit templates; the `style` binding rule; the dependency-cruiser rules that would refuse `lit`; the element test setup; the icon build step with `map`'s notices file; size and speed baselines and the temporary ceilings.
2. **First element: the risk check.** One segmented control and the announcer in Lit, rendered by the React interface.
3. **Message store** in `core`. `ServicesProvider` and the host read it.
4. **The element moves to `map`,** with `MountMapError`, validation, tools, types, layers and languages. `sdk/src/browser` bundles it with its defaults. The layer table does not change. No behaviour change.
5. **Controller, part one:** surfaces, pin, measure, focus return, the shared link and saved view. Full `Services`.
6. **Controller, part two:** draw, directions and the routing credits, identify and selection. New `tools` names are settled here.
7. **Controller, part three:** tour and banners.
8. **Host content and page structure:** the plain data, the brand container, the region id and the landmark choice.
9. **Events, stores and WebMCP.** `examples/embed` then uses only the element and `core` (and the adapter where it sets up services).
10. **The host's other pages:** its own markup, announcer and icons, the skeleton function, and the scanner paths.
11. **The reference host uses only the element and `core`** (and the adapter in its composition root). The design guide changes and the fixture page lands.
12. **Remove the public React API.** `map` exports the list above; `@mapcairn/react` leaves the repository and the release set, with the umbrella's `./react` export. Release tooling must accept a package that was released before and is not now: `releasedReports` in `scripts/apiBreakingCheck.mjs` and `compareApiReports` in `scripts/release/apiChanges.mjs` read only the current list today, so the removal would not show. Read the released set from the tag. Also `check.mjs`, `workspaces.mjs`, `plan.mjs`, the attestation and published-version checks, the consumer apps and `consumer/src/contracts.ts`, and the host's product page and `llms.txt` text. Breaking.
13. **Primitives** in Lit; Radix removed.
14. **Panels and layers** in Lit.
15. **Tools** in Lit: search, measure, draw, directions, locate, pin and tour.
16. **Sheet, end stack, readout and credits** in Lit.
17. **Chrome and map host** in Lit. The controller loses its React reader.
18. **Remove React** from `map` and `sdk`: dependencies, peers, build plugins, the bundle's React, size ceilings, lint domains and `ARCHITECTURE.md`. The last pull request deletes this plan and its entry.

The framework checks (#676: Svelte first, then the rest, and plain JavaScript), the getting-started pages (#678) and the English messages for a page with no build (#1010) follow step 12. They and step 18 finish before the release (#913).

## Documents to update

- `ARCHITECTURE.md`: layers, ports, the browser route's design and packaging, in steps 3, 4, 6, 12 and 18.
- `DESIGN.md`: component contracts, icons, host places, the design guide and the lint section, in steps 1, 2, 8, 10, 11 and 13 to 17.
- Guides and READMEs, including `extending.md`, `public-api.md` (packages and entries), `capability-matrix.md` and the README's package list: steps 9, 11, 12 and 18. `docs/guides/releasing.md` (release set and ceilings): steps 1, 12 and 18.
- A migration guide, written in step 12, with Before and After blocks for each way of using 0.2.0 (the composed React interface, single components, hooks and `@mapcairn/react`). The 0.3.0 release notes list each removed export, taken from the API report difference, each pointing to its Before and After block, which one group of exports may share.
- Adopter pages describe behaviour, not how the interface is built (`adopterWording.test.ts`).
- `AGENTS.md`: package list and boundaries, steps 12 and 18.
- `PRIVACY.md`: no change expected.

## Risks

- **A host needs something the element does not offer.** The reference host and the example are rewired before anything is removed, so a gap shows by step 11.
- **Users of single components or hooks lose them.** The migration guide says so plainly and points to `core` and the adapter.
- **Behaviour drifts in the rewrite.** The specs run against one boundary throughout, and each step lists the hooks it must keep.
- **Two renderers for a while.** The bundle carries React and Lit between steps 2 and 18, so it grows first. Nothing is released in that window.
- **Server paint changes on the reference site.** The skeleton keeps its boxes; `e2e/skeleton.spec.ts` holds no layout shift.
- **An urgent 0.2.x fix.** The release workflow publishes only from `main`, which will not be releasable as a patch. See below.

## Decided and open

Decided 2026-11-27, by the maintainer: Lit, with no separate prototype; one public element, with its inside private; the deprecation notice period waived for this move; 0.3.0 is the Lit release.

Decided in this plan: the boundary changes before the rewrite; `@mapcairn/react` is removed; no `@lit/react`; no new dependency besides `lit` at run time.

Open:

1. **A patch to 0.2.x during the move.** Recommendation: build nothing now. If a security fix cannot wait for 0.3.0, a separate, reviewed change lets the release workflow publish from a `release/0.2` branch cut from `v0.2.0`. That changes the publishing path, so it is the maintainer's decision at the time.
