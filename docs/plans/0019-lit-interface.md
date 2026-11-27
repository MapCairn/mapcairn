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

The public boundary changes while the inside is still React, and the inside is rewritten afterwards.

1. `<mapcairn-map>` moves from `packages/sdk/src/browser` into `packages/map`. For now it draws the React interface in a root of its own, as `mountMap` does today.
2. It gains what the reference host needs, until the host uses only the element.
3. The public React exports are removed. From here the inside has no outside user.
4. The inside is rewritten in Lit, from the leaves to the containers. A React part may render a Lit element; a Lit element never renders React.

The browser specs then run against the final boundary through the whole rewrite, and no temporary React wrapper is ever public. Rewriting leaves first with exported wrappers was rejected: it keeps about 160 public React exports working while their insides change, and removes them all at the end.

Also rejected, by decision (#1015): public elements for each building block, and a public element for every component. Both keep a large API stable for hosts that want their own arrangement. Such a host builds on `core` and the MapLibre adapter.

### What the element offers

The exact names are settled in steps 3 to 5, each with its API report. The outline:

- **Services.** The whole of `MapServices` can be passed as a property. What a host leaves out of the plain-data options keeps the defaults that `mountMap` builds today. `packages/map` imports no adapter, so the defaults that need one stay in `sdk/src/browser`, which hands them to the element's definition.
- **Behaviour.** What `useMapApp` and `AppChrome` do in the host (the open surface, pin, measure, draw, directions, locate, selection, tour, banners, saved view and focus return) moves into one private controller in `map`, starting from `core`'s `surfaceReducer`. `MountedMap` and `MountedChrome` merge into it.
- **Host content.** Named places for what a host adds today: the brand in the sheet, notes (privacy, routing, pin lookup), the about links in Help, the link in the credits, tour steps, and the notice when the map cannot start. Text and links are plain data. Markup goes into a stable container node that the element creates when constructed and exposes as a property: React fills it with a portal, Svelte with `mount`, plain JavaScript with `append`. The element never moves a host's own nodes, and a framework never renders children into the element itself.
- **Events and handle.** The four `mapcairn-*` events, plus what the host and `examples/embed` read today: layer state and actions, the selected features, and what the WebMCP tools need. State is read through a store with `subscribe(listener)` and `getSnapshot()`, the shape the catalogue and preference stores already have, so a React host reads it with `useSyncExternalStore`.
- **WebMCP.** `map` exports a framework-neutral `registerModelContextTool(definition)` that returns an unregister function, with the model context types. The host and the example wrap it in a few-line hook.
- **Server rendering.** The element draws only in a browser. Importing it on a server does nothing. `ChromeSkeleton` becomes a pure function that returns the skeleton's HTML with its copy escaped, which any server can send. The host's other server-rendered pages use markup and icons of their own.

`@mapcairn/map` then exports `defineMapElement`, the element and event types, the store types, the model context registration, the skeleton function and the stylesheet. Ports and domain types stay in `core`. `@mapcairn/sdk/browser` keeps `mountMap` and the element, bundled with defaults.

### Packages

- `@mapcairn/react` is removed in step 6. Its `useReadingDirection` and `useLatestRef` are internal needs; the host keeps its own copy of what it uses. The release set becomes five packages. 0.2.0 stays on npm, and marking the old package deprecated there is a maintainer step.
- No wrapper package for any framework. React 19 sets properties on custom elements and listens to their events, so the package ships JSX typings, as `@mapcairn/sdk/browser/react-jsx` does now.
- #1014 (a package of its own for the browser route) is closed as superseded: its reason is the React peers, which step 12 removes from `sdk` and `map`. `maplibre-gl` stays a peer.

### Inside the element

- **Reactive properties** use `static properties` with `declare` fields set in the constructor, and no decorators. The base `tsconfig` keeps class fields on, where a plain field would hide Lit's accessor.
- **Light DOM.** `createRenderRoot()` returns the element, so Lit's `static styles` are not used and the vanilla-extract stylesheet ships as it does now.
- **CSP.** No `style` attribute binding in a template: the production policy is `style-src 'self'`. Computed styles are set through `element.style.setProperty`.
- **Wiring.** A parent hands each private element the controller or the values it needs as properties. There is no context lookup. Each map makes one id prefix, from a counter and a random suffix, for `aria-controls` and label ids.
- **Registration** is by function, from `defineMapElement`, never on import, except the existing `browser-element` entry.
- **Two copies on one page.** Element names are global to a page. A private element of one copy must never run another copy's class. Step 1 chooses how (private names that carry a per-copy suffix, or no custom element where a template function is enough) and proves it with a test that loads two copies.
- **Native controls** replace Radix: a checkbox with `role="switch"`, a range input, and radio inputs. `Tooltip` is deleted: no SDK component renders it.
- **Icons** are Phosphor SVGs taken at build time from a development dependency, with its licence in the notices. The Biome restriction on that package is narrowed for the build step only. The reference host keeps `@phosphor-icons/react` for its own pages.

### What must not change

The browser specs hold these through every step: accessible names and roles, keyboard behaviour and focus return, announced text, `data-testid`, `data-chrome` and `data-state`, the `aria-controls` link from the end stack to the sheet, two maps on one page with distinct ids and landmarks, and no inline style or script under the strict policy. Expected spec rewrites are named in the step that makes them: `theme-override` (it selects Radix's popper) and `app-shell` (it matches React hydration errors).

## Tests

- Step 1 starts with a planted failing case for each guard: inline English in a Lit template, a raw colour in a template, a `style` binding, and an icon-only button with no name.
- The first Lit element starts with failing tests for its keyboard behaviour and name, for a property set after construction re-rendering it, and for two copies on one page. The strict-policy legs in `scripts/release/bundleRun.mjs` collect violations over it, with one planted `style` binding shown to fail.
- Behaviour that moves from the host into the controller keeps its host tests until the controller has the same cases, written first.
- Each rewrite step replaces that area's React Testing Library tests in the same pull request. Pure logic moves to plain modules with their tests first. The coverage floors do not change and nothing new is excluded.
- First-load size is measured with the pack check's rule after steps 1, 5, 8 and 12.

**What stops the move.** Any of these goes to the maintainer before more is ported: a WCAG 2.2 AA behaviour that the Lit element cannot match; a strict-policy violation with no CSSOM route around it; focus or a first announcement lost to asynchronous rendering with no reliable fix; or a first load larger than today's once React has gone.

## Order of work

Each step is one pull request or a short run of them, with the build green.

1. **Guards and the first element.** `lit` in `map` (`licence:sdk`); copy check and harmony scanner read Lit templates; the `style` binding rule; the dependency-cruiser rules that would refuse `lit`; the element test setup. Then one segmented control and the announcer in Lit, rendered by the React interface. This is the risk check.
2. **The element moves to `map`.** `sdk/src/browser` bundles it with its defaults. No behaviour change.
3. **Full services and the controller.** Directions, selection, tour, banners and saved view move into the element, test first.
4. **Host content.** The named places and container nodes.
5. **Events, stores and WebMCP.** Then the reference host and `examples/embed` use only the element and `core`. The skeleton function and the host's own server-page markup land here. The design guide shows the element and the tokens.
6. **Remove the public React API.** `map` exports the list above; `@mapcairn/react` leaves the repository and the release set; the umbrella, consumer apps, release, attestation and published-version scripts, which must accept a package that was released before and is not now, and the documents follow. Breaking.
7. **Primitives** in Lit; Radix removed.
8. **Panels and layers** in Lit.
9. **Tools** in Lit: search, measure, draw, directions, locate, pin and tour.
10. **Sheet, end stack, readout and credits** in Lit.
11. **Chrome and map host** in Lit, then the controller loses its React form.
12. **Remove React** from `map` and `sdk`: dependencies, peers, build plugins, the bundle's React, size ceilings, lint domains and `ARCHITECTURE.md`. The last pull request deletes this plan and its entry.

The framework checks (#676: Svelte first, then the rest, and plain JavaScript), the getting-started pages (#678) and the English messages for a page with no build (#1010) follow step 6 and finish before the release (#913).

## Documents to update

- `ARCHITECTURE.md`: layers, the browser route's design and packaging, in steps 1, 2, 6 and 12.
- `DESIGN.md`: component contracts, icons, host places and the lint section, in steps 1, 4, 5 and 7 to 11.
- Guides and READMEs: steps 5, 6 and 12. A migration guide, with Before and After for each way of using 0.2.0 (the composed React interface, single components, hooks), is written in step 6 and linked from the 0.3.0 notes. It covers every removed export by group. This is how the Before and After promise on #1015 is met.
- Adopter pages describe behaviour, not how the interface is built (`adopterWording.test.ts`).
- `AGENTS.md`: package list and boundaries, steps 6 and 12.
- `PRIVACY.md`: no change expected.

## Risks

- **A host needs something the element does not offer.** The reference host and the example are rewired before anything is removed, so a gap shows in step 5.
- **Users of single components or hooks lose them.** The migration guide says so plainly and points to `core` and the adapter.
- **Behaviour drifts in the rewrite.** The specs run against one boundary throughout, and each step lists the hooks it must keep.
- **Two renderers for a while.** The bundle carries React and Lit between steps 1 and 12, so it grows first. Nothing is released in that window.
- **Server paint changes on the reference site.** The skeleton keeps its boxes; `e2e/skeleton.spec.ts` holds no layout shift.
- **An urgent 0.2.x fix.** The release workflow publishes only from `main`, which will not be releasable as a patch. See below.

## Decided and open

Decided 2026-11-27, by the maintainer: Lit, with no separate prototype; one public element, with its inside private; the deprecation notice period waived for this move; 0.3.0 is the Lit release.

Decided in this plan: the boundary changes before the rewrite; `@mapcairn/react` is removed; no `@lit/react`; no new dependency besides `lit` at run time.

Open:

1. **A patch to 0.2.x during the move.** Recommendation: build nothing now. If a security fix cannot wait for 0.3.0, a separate, reviewed change lets the release workflow publish from a `release/0.2` branch cut from `v0.2.0`. That changes the publishing path, so it is the maintainer's decision at the time.
