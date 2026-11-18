# 0009: A message catalogue port, and English plus Afrikaans on the reference host

Status: built. Tracking issue: #231. The Afrikaans catalogue was offered as a draft and has since been reviewed and approved. Layer feature-template translations are tracked separately in [plan 0012](0012-layer-template-translation.md).

## Goal

A host using the SDK can replace or translate every word the interface shows, without forking a component, and without the SDK carrying a translation library or anyone else's data. The reference site ships in English (`en-GB`, the default and the source language) and Afrikaans. A visitor's choice is remembered on the device, as the other settings are, and defaults from the browser's language when it is one the host offers.

## Ground rules

- No new runtime dependency in an SDK package (`AGENTS.md`, "Dependencies"; the issue, "Constraints"). The port is small and built on `Intl.PluralRules`, `Intl.ListFormat` and `Intl.NumberFormat`/`Intl.DateTimeFormat`, which every target runtime has.
- English users must not pay for Afrikaans: only the active language's text is in the English-only bundle's cost; a second language is additional, on-demand weight, not shipped to someone who never asks for it (issue, "Constraints"). No automated check enforces a bundle-size budget in this repository today; the design keeps the cost small by shape (a dynamically-imported module per language), and a check that would catch a regression is not part of this plan.
- British English stays the source language of the copy and of the documents (`AGENTS.md`, "About"); the catalogue's default values are written in British English.
- The source strings keep their accessibility contracts: a name that contains its visible label still does once both are looked up by key, and each outcome still gets exactly one announcement (`DESIGN.md`).
- Translations are reviewed. The original decision to review Afrikaans before release was changed on 2026-11-16: the reference site offered the draft first. The maintainer, a fluent speaker, reviewed and approved it on 2026-11-18 (#231).
- Adding a dataset or a provider is a separate decision and is out of scope; this plan touches no basemap or layer provider. Sending the visitor's language to a search or routing provider is also out of scope and needs its own `PRIVACY.md` and provider-note change, decided by the maintainer when an adapter proposes it.
- This plan decides the public API the ports and `Services` gain; `ARCHITECTURE.md` and `DESIGN.md` are updated with it, not after it.

## Design

### Where the English-only rule sits today

`<html lang="en-GB">` is static markup in `packages/web/src/root.tsx`'s `Layout`; nothing reads a setting for it. Copy is written inline in JSX across `packages/map/src` (button text, `aria-label`s). The single live region's text is built by plain functions in `packages/core/src/announce/announce.ts` that already return a finished English sentence (for example `announceLayerLoaded(name, count)` returns `` `${name}: ${formatNumber(count)} shown on the map.` ``), as do the shape and measurement describe functions in `packages/core/src/draw/describe.ts` and `packages/core/src/units/measurement.ts`. `formatNumber` (`packages/core/src/format/format.ts`) calls `new Intl.NumberFormat("en-GB", options)` with the locale fixed in the call; `formatLatitude`/`formatLongitude` hard-code the hemisphere letters `"N"/"S"` and `"E"/"W"`. Every other service a host can swap (theme, settings, layers, basemaps) already follows the ports-and-adapters shape this plan reuses: a typed port in core, a fake, a shared contract suite, and, in `packages/core/src/contracts/portRegistry.ts`, one more entry in `PORT_NAMES`, `PortContractRunners` and `PORT_REGISTRY`. `BasemapDefinition.name` and a layer definition's `name`, `description` and control `label`s (`packages/web/src/layers/definitions/*.ts`) are plain strings the host writes, the same place credit text already lives (`ATTRIBUTIONS.md`).

### The port

`packages/core/src/ports/messages.ts` adds:

```ts
/** A key into the shipped catalogue. One flat, hand-maintained union, grouped by area. */
export type MessageKey = /* "layers.loaded" | "announce.imageSaved" | "settings.resetToDefaults" | … */;

/** The parameters a key's placeholders need, keyed by MessageKey. Checked by a test, not generated. */
export type MessageParams = { /* "layers.loaded": { readonly name: string; readonly count: number }; … */ };

/** Formats text for one language. The SDK's default is `createMessageCatalogue`; a host may wire a message-format library of its own behind the same shape. */
export interface MessageCatalogue {
  /** BCP 47 tag of the language this instance speaks, for example "en-GB" or "af". */
  readonly language: string;
  /** Looks up a key, substitutes its parameters, and falls back to the English value with a development-only warning when the active catalogue is missing the key. */
  t<K extends MessageKey>(key: K, params: MessageParams[K]): string;
  /** As `t`, but picks the plural form with `Intl.PluralRules` first. `params` carries `count` plus the key's other parameters. */
  plural<K extends MessageKey>(key: K, params: MessageParams[K] & { readonly count: number }): string;
  /** Joins items with `Intl.ListFormat` ("Topographic, Satellite and Dark"), `type` defaulting to "conjunction". */
  list(items: readonly string[], type?: "conjunction" | "disjunction"): string;
}
```

`createMessageCatalogue(language, catalogue, fallback)` (core) builds the real, dependency-free implementation from a plain `Record<MessageKey, string>` (placeholders written `{name}`, `{count}`) plus the English `fallback` record, warning once per missing key with `console.warn`. `FakeMessageCatalogue` scripts a missing key and a placeholder mismatch for tests. The contract suite (`contracts/messageCatalogue.contract.ts`) proves: every key resolves to a string containing its substituted parameters, a missing key falls back to the English value and warns exactly once per key per instance, `plural` picks the English plural rule correctly for 0, 1 and many, and `list` matches `Intl.ListFormat`'s own output for the instance's language. `Services.messages: MessageCatalogue` becomes a required port: one more line in `PORT_NAMES`, `PortContractRunners` and `PORT_REGISTRY` in `packages/core/src/contracts/portRegistry.ts`, with `createFake: () => new FakeMessageCatalogue()`. A test (`packages/core/src/lint`) checks that the English catalogue (below) has a value for every `MessageKey` and that a value's placeholders are exactly its `MessageParams` entry, so a key added to the type without a string, or a string with a typo'd placeholder, fails the build.

`packages/core/src/messages/en-GB.ts` exports `EN_GB_CATALOGUE: Record<MessageKey, string>`, the SDK's shipped default, built from today's inline and `announce.ts` strings verbatim. `createServices()` builds the active instance as `createMessageCatalogue(language, catalogueFor(language), EN_GB_CATALOGUE)`.

### Swapping the active language at runtime

`Settings.language: string | null` joins `Settings` in `packages/core/src/ports/settings.ts`, `null` meaning "follow the browser", the same shape as `saveData`. `resolveLanguage(choice, offered, browserLanguages)` (core, a pure function beside `resolveTheme`) picks `choice` if the host offers it, else the first of `browserLanguages` the host offers, else the host's default language — mirroring how the theme resolver combines a stored choice with a system source.

A host offers one or more languages as plain data, the same shape as `BasemapCatalogue`: `LanguageCatalogue = { readonly languages: readonly { readonly tag: string; readonly label: string }[]; readonly defaultLanguage: string; load(tag: string): MessageCatalogue | Promise<MessageCatalogue> }`. The default language's catalogue is synchronous (it is already in the bundle); any other language's `load` may return a promise, so a host lazy-loads it (`import("./i18n/af")`, the same dynamic-import shape `MapLibreMapAdapter` already uses for `maplibre-gl`). This is plain data with one shape and no second implementation, like `BasemapCatalogue`, so it is a `DATA_SERVICE_NAMES` entry (`Services.languages?`), not a port, and a host that offers only one language (the common case for an embedder) may leave it out entirely, in which case the ui never shows a language switcher. `useMessages()` (`packages/react`) holds the active `MessageCatalogue` in state, reads `Settings.language` and the device's `navigator.languages` through the existing `DevicePreferences`-style read, resolves it, and calls `languages.load(tag)`; while a lazily-loaded language is pending it keeps the previous catalogue (usually the default) rather than showing blank text, the same "keep the last good state while a load is pending" rule `LayerCatalogue` already follows. Switching away from a language that then finishes loading is ignored, as a superseded layer-catalogue load is.

### Everything user-facing goes through it

- **Components** (`packages/map/src`) stop writing literal copy in JSX. Each reads `useMessages()` and calls `t(key, params)` for its text and its `aria-label`s. This is the bulk of the work and is moved component by component (Order of work), not in one step.
- **Announcements.** Every function in `packages/core/src/announce/announce.ts` changes from returning a string to returning `{ key: MessageKey; params: MessageParams[K] }` (or a small discriminated union when a function can announce one of several outcomes, as the directions and search error builders do today). The one shared announcer component in `packages/map` (the live region) is the single place that calls `t`/`plural` on the result, right before it sets the region's text — "formatted at the edge," per the issue. `describe.ts` (shape/measure descriptions) and `measurement.ts`'s `describeDistance`/`describeArea`/`pluralise` change the same way; their callers (the Shapes panel, the exported image's drawn labels) format at the point they render, not in core.
- **Errors.** `SEARCH_ERROR_MESSAGES`, `LOCATION_ERROR_MESSAGES` and the routing error messages in `announce.ts` become `MessageKey`s keyed by their existing error-kind unions, so a `switch` over `SearchErrorKind` that already names every case keeps doing so.
- **The tour**, and **basemap and layer definition text** (`name`, `description`, control `label`s, credit lines): a definition's string fields become `MessageKey | string` — a plain string still works unchanged (a host that defines one language needs nothing new), and a `MessageKey` is looked up through `useMessages()` where the definition is rendered (the picker, the Layers section, the legend, the credits). The reference host's own definitions move to keys; a third party's existing definitions, found in the wild, keep working as plain strings.

### Locale-aware formatting

`formatNumber` gains a `language` argument (`formatNumber(value, language, options)`) in place of the literal `"en-GB"`; every caller already has a `MessageCatalogue` in scope (directly or through `t`/`plural`, which pass their own `language` down to any formatting they do) and passes its `language`. `formatLatitude`/`formatLongitude` take the hemisphere letters as parameters instead of a literal `"N"/"S"/"E"/"W"`, sourced from four `MessageKey`s (`format.hemisphereNorth` and so on) so Afrikaans can say N, S, O and W without a branch on language anywhere in `format.ts`. Dates keep `Intl.DateTimeFormat` with an explicit `language` the same way; a time that is shown in UTC keeps saying so in every language, as a fixed suffix key. Coordinates copied to the clipboard (`formatLatLng`, used for the exact value that is pasted elsewhere) are unchanged: they stay locale-independent on purpose, as the existing remark on `formatFixed` says, and this plan does not touch that.

### `lang`, and what renders before the client resolves a language

`packages/web` is server-rendered and a visitor's stored language lives in `localStorage`, which the server cannot read at request time; this plan keeps that boundary rather than adding a cookie or reading `Accept-Language`, which would be a new signal this plan does not need and a question of its own. The shell therefore server-renders in the host's default language (English on the reference site) exactly as it does today, and the client resolves the stored or browser language and swaps in its catalogue during hydration, the same moment `useMessages()` first runs. A returning visitor who chose Afrikaans sees a short flash of English text on the very first load of a new browser tab, the same trade-off already accepted for example for the theme, where a flash is prevented only because the theme is a CSS attribute a tiny inline script can set before paint; full text cannot be swapped that way without duplicating the whole catalogue into an inline script, which this plan rules out as a cost that is not worth paying for a flash of at most one render. `<html lang>` does change before paint: `buildThemeBootstrapScript` (core) gains the stored language tag and sets `document.documentElement.lang` alongside `data-theme`, covered by the same `suppressHydrationWarning` already on `<html>` and the same CSP-hash test that pins the script's exact text, in `public/_headers` and `constants/securityHeaders.ts`. Mixed-language content (a provider's own name, an address from a geocoder) is marked with `lang` on the element that holds it, which is new markup in the handful of places that show such text, not a service.

### Right-to-left

Not a shipped language yet, so no component changes its layout today. The harmony scanner (`scripts/harmony/rules.mjs`) gains a rule that fails a new vanilla-extract property that is physical (`marginLeft`, `paddingRight`, `left`, `right` used for position) rather than logical (`marginInlineStart`, `insetInlineEnd`), with the existing files on an allowlist so the rule only holds new code to the bar; converting the existing files is its own step. A Playwright project is added that runs with `dir="rtl"` set on a pseudo-locale (mirrored English, not a shipped language, so no translation is needed to test it) and checks the basemap, chrome and sheet specs it is given, the same subset WebKit already runs, for a layout that still reads correctly mirrored.

## Tests

- A failing test in `packages/core/src/lint` first: every `MessageKey` has an English value, and a value's placeholders are exactly its `MessageParams`. It fails until `createMessageCatalogue`, `EN_GB_CATALOGUE` and the type exist.
- The message catalogue contract suite (new), run against `createMessageCatalogue` and `FakeMessageCatalogue`, proves missing-key fallback and warning, plural selection and list formatting.
- `resolveLanguage` gets the same kind of unit tests `resolveTheme` has: an offered choice, an unoffered choice, and each position in `browserLanguages`.
- A component moved to keys keeps its existing tests passing by asserting on the rendered text (which is still English, by default), plus one new test that swaps in a scripted `FakeMessageCatalogue` and asserts the component calls `t`/`plural` with the right key and parameters, not a hard-coded string, catching a component that quietly stays on inline copy.
- `formatNumber`, `formatLatitude` and `formatLongitude` get a non-English-language case (Afrikaans's own catalogue, or a scripted stand-in before it exists) proving the hemisphere letters and grouping change and the UTC suffix does not.
- A Playwright spec (existing, re-run) for the layout collision test and the accessibility specs also runs once more in Afrikaans, as the issue asks, once the Afrikaans catalogue exists.
- The RTL Playwright project is new and is proved by it finding at least one overflow in the mirrored layout before the logical-properties step lands, and finding none after.

## Order of work

Each step is one pull request and leaves `main` building and shippable.

1. **The port, the English catalogue, and one panel.** `packages/core/src/ports/messages.ts`, `createMessageCatalogue`, `FakeMessageCatalogue`, the contract suite, the `portRegistry.ts` entry, `EN_GB_CATALOGUE` seeded from the Settings panel's current copy only, and the Settings panel itself moved to call `t`. Every other component keeps its inline copy; the catalogue is additive and nothing in behaviour changes yet. Touches `packages/core`, `packages/react` (`useMessages()`), `packages/map` (the Settings panel), `packages/web` (`createServices()` passes the port).
2. **Announcements and describe functions.** `announce.ts` and `describe.ts`/`measurement.ts` change to key-plus-parameters; the shared announcer formats at the edge. The largest single-file change, and independent of moving the rest of the components.
3. **Formatters and coordinates.** `formatNumber`, `formatLatitude`, `formatLongitude` take a language; every caller threads it through.
4. **The remaining components**, moved panel by panel (chrome, sheet, tools, pickers), each its own small pull request, following the pattern step 1 set.
5. **Definition text.** `BasemapDefinition` and a layer definition's string fields accept `MessageKey | string`; the reference host's own definitions move to keys.
6. **The language setting and switcher.** `Settings.language`, `resolveLanguage`, `LanguageCatalogue`, `useMessages()`'s lazy load, the `lang` attribute in the bootstrap script, and the switcher control in the Settings panel. Lands once enough of steps 1–5 are in that switching language visibly changes most of the interface.
7. **The Afrikaans catalogue**, written as a draft, wired as the reference host's second `LanguageCatalogue` entry and lazy-loaded, then reviewed by the maintainer.
8. **Right-to-left readiness.** The harmony scanner rule, the logical-properties pass over existing vanilla-extract files, and the mirrored-layout Playwright project.
9. **The guide for hosts.** `docs/guides/translate-the-sdk.md`: how to add a language, how to wire a host's own message-format library behind the port, how definition text carries translations.

Splitting these into GitHub issues is the `split-plan` skill's job, once this plan is merged.

## Documents to update

- `AGENTS.md` ("About"): from "The app is English only... with its copy written inline in components" to British English as the source language, translatable through the catalogue. Step 1.
- `ARCHITECTURE.md`: the ports table gains `MessageCatalogue`; "Pure helpers" notes that announcement and describe functions now return keys, not text; a new short section describes the catalogue and the language setting the way "Host-supplied basemaps" describes `BasemapCatalogue`. Steps 1, 2, 6.
- `DESIGN.md`: a components-and-accessibility note that a name or announcement is now a key, and the logical-properties rule. Steps 1, 8.
- `README.md` and the package READMEs (`core`, `react`, `map`): the SDK offers any language, not English only. Step 1 or 6.
- `docs/guides/extending.md`: a "Translate the SDK" section, or the new guide linked from it. Step 9.
- `docs/guides/performance.md`: a note on the on-demand language weight. Step 6 or 7.
- `ATTRIBUTIONS.md`: translator credit for the Afrikaans catalogue. Step 7.
- `CONTRIBUTING.md`: how to add a language (a catalogue file and the checks step 1 and 7 add). Step 7 or 9.
- `PRIVACY.md`: only if a provider adapter starts sending the visitor's language, which this plan does not do; out of scope, flagged above.

## Risks

- **A missed inline string.** A component not yet moved still shows English under any language. Mitigated by moving components in small, reviewable steps (step 4) rather than one pass, and by the per-component test in "Tests" that fails when a moved component still hard-codes text.
- **The English flash on first paint in a non-default language**, described above under `lang`. Contained by being a one-render flash, not a layout break, and by `<html lang>` itself changing before paint regardless.
- **Placeholder drift between the English value and a translation.** Contained by the lint test in "Tests": every catalogue's placeholders must match `MessageParams`, which fails the build, not just a review.
- **The reference host's bundle growing for every visitor**, not just one choosing Afrikaans. Contained by `LanguageCatalogue.load` being allowed to return a promise and the non-default language living in its own dynamically-imported module; no automated bundle-size check exists in this repository today to catch a regression, so this is a shape the design holds to, not a check that enforces it.
- **A host's existing third-party basemap or layer definitions breaking** when `name`/`description` become `MessageKey | string`. Contained by the type staying a union that still accepts a plain string, so an unmodified definition keeps working.
- **Scope creep into search or routing sending the language to a provider.** Ruled out above; any adapter change here needs the maintainer and a `PRIVACY.md` update first, on its own.

## Decided and open

Decided, 2026-11-14 (the issue): the SDK supports any language with no new dependency; the reference host ships English and Afrikaans first; translations are reviewed before they ship; right-to-left is design-ready but not a shipped language yet.

Changed, 2026-11-16 (#231): the Afrikaans draft was offered before review. The review was approved on 2026-11-18.

Decided, this plan:

- The catalogue is a port (`MessageCatalogue`) with a dependency-free default implementation and a documented seam for a host's own message-format library, because the issue asks for both and the existing ports-and-adapters shape already fits it.
- Announcement and describe functions return a key and parameters, formatted at the one place that renders them, per the issue.
- `Settings.language` follows the existing `saveData`/theme shape (`null` meaning "follow the device"), for consistency with the rest of `Settings` and because it needs no new kind of storage.
- The server always renders the host's default language; the client resolves and swaps. Recommendation taken: a cookie or `Accept-Language` read would avoid the first-paint flash but adds a second source of truth and, on Workers, a cache-key question (a cached page now varies by a header) this plan does not need to open. The flash is also bounded to users who have chosen a non-default language, a minority on a site whose default is already the source language.

Open, for the maintainer:

- **Where the Afrikaans catalogue file lives**: `packages/web/src/i18n/af.ts`, next to the other reference-host-only data (layer definitions, host basemaps), is the plan's recommendation, over a dedicated package, because it is one host's data with no second consumer yet, the same reasoning `ARCHITECTURE.md` already gives for the host's own basemap definitions.
- **Whether the language switcher sits in the Settings panel** (alongside theme and units, this plan's recommendation, for consistency and the least new chrome) **or gets its own control**, such as a visible toggle outside the sheet. The Settings panel is the simpler, lower-cost choice and matches how theme and units are already offered.
- **The RTL Playwright project's scope**: this plan recommends the same subset WebKit already runs (basemap, keyboard, sheet, app-shell), reusing an existing precedent for "not every spec, on purpose," rather than the full suite, to keep CI time down for a check with no shipped language yet to validate against.
