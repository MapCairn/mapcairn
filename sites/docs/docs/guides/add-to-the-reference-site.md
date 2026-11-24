---

title: Add to the reference site
sidebar_label: Add to the reference site
description: Contributor steps for adding a basemap, a data layer, a routing or suggestion provider or a language to the reference site in this repository.
---

# Add to the reference site

This page is for a contributor who changes the reference site, the host app in `packages/web` in this repository. By the end you will know the files to touch to add a basemap, a data layer, a routing or suggestion provider or a language to it. An app of your own needs none of these steps: [Extend the SDK](extending.md) and [Translate the SDK](translate-the-sdk.md) say how to add the same things there.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## Add a basemap

Defining a basemap in the SDK and offering it on the reference site are separate. `BASEMAPS` holds every basemap the SDK defines (seven today). The site does not offer them all: `packages/web/src/basemaps/hostBasemaps.ts` lists the ids it offers, in picker order (six today), and builds its catalogue from them.

1. Add a `BasemapDefinition` to `BASEMAPS` in `packages/core/src/basemaps/basemaps.ts` (the fields are in [Extend the SDK](extending.md#add-a-basemap)). The SDK's basemap test lists the tile origins whose terms allow commercial use with no agreement. It fails for a new origin until you have read that provider's terms and added the origin there with the reason.
2. Add its id to `HOST_BASEMAP_IDS` in `packages/web/src/basemaps/hostBasemaps.ts`, where you want it in the picker. It fails at start-up, with the id in the message, if the SDK defines no such basemap.
3. Allow the provider's origins in the Content Security Policy (`img-src` and `connect-src`) in `packages/web/src/constants/securityHeaders.ts` and, identically, `packages/web/public/_headers`; a test keeps the two in step. Read the style and its tile sets to find every host they request (sprite, glyphs, terrain), and add only those.
4. Add its id and preview path to `BASEMAP_THUMBNAILS` in `packages/web/src/basemaps/basemapThumbnails.ts`, render the preview with `node scripts/generateBasemapThumbnails.mjs <id>` and commit the image in `packages/web/public/basemaps/`. A basemap with no entry shows the picker's plain swatch.
5. Record the provider in `ATTRIBUTIONS.md` and in the map tiles section of the privacy page (`packages/web/src/app/PrivacyPage.tsx`) and `PRIVACY.md`.
6. Update the basemap constants in `packages/web/e2e/support/basemaps.ts` (`BASEMAP_COUNT` and the rest) and the tests that count basemaps, and the backdrop per basemap in `packages/web/src/basemaps/chromeLegibility.test.ts`. A spec that needs a basemap the site does not offer (the SDK's Colorful, say) runs on a host that offers the SDK's whole list, through `scriptBasemaps` in `packages/web/e2e/support/services.ts`.

To take a basemap off the site while keeping it in the SDK, remove its id from `HOST_BASEMAP_IDS`, its origin from the Content Security Policy, its entry in `BASEMAP_THUMBNAILS` and its preview image, and its provider from `ATTRIBUTIONS.md`, `PRIVACY.md` and the privacy page, if nothing else the site offers uses them. A saved or linked id the site no longer offers opens on Bright.

A provider whose licence the reusable SDK packages must not carry, or whose volunteer-run server should not be sent the traffic of every app built on the SDK, or that asks to be told of use, is not added to `BASEMAPS`. Define it in the host instead. The reference host defines none today: it removed Topographic (a volunteer-run server with no availability guarantee) and Satellite (imagery licensed for non-commercial use only). The host's catalogue is built with `createBasemapCatalogue` and passed by the composition root as `Services.basemaps` (see `ARCHITECTURE.md`, host-supplied basemaps). Its preview would be an entry in `BASEMAP_THUMBNAILS`; leave the entry out when you have no right to a preview image, and set `swatch`, a hex colour of your own, so its picker tile does not look like the default.

To change the reference site's default basemaps, change `DEFAULT_BASEMAP_ID` and `DEFAULT_DARK_BASEMAP_ID` with their land colours `DEFAULT_BASEMAP_BACKGROUND` and `DEFAULT_DARK_BASEMAP_BACKGROUND` (the new style's `background` layer colour) in `basemaps.ts`, and the matching `defaultBasemap` and `defaultDarkBasemap` backdrops in `packages/theme/src/tokenValues.ts`, which the `mapBackground` token reads for each theme. A test in `packages/web` fails until they agree.

## Add a data layer

A layer is data, not code: one definition file, one recorded fixture (feeds only) and the provider's origins in the Content Security Policy. Nothing in the code names a layer, a provider or a response shape. The definitions themselves are described in [Extend the SDK](extending.md#add-a-data-layer).

1. Add `packages/web/src/layers/definitions/<id>.ts` with a default export of a `LayerDefinition` (types in `packages/core/src/layers/definition.ts`). It is picked up by `import.meta.glob`, so no list needs editing. A feed names its decoder (`geojson`, or one you register in `packages/web/src/layers/index.ts`).
2. For a feed, record a small sample response in `packages/web/src/layers/fixtures/` and add it to `manifest.json` with the number of features it should decode to (and a detail fixture if the layer has `detail`).
3. Add the provider's origins to `public/_headers` and `src/constants/securityHeaders.ts`: feeds in `connect-src`, tiles in `connect-src` and `img-src`.
4. Add the provider's credit to `ATTRIBUTIONS.md` and name the provider in the privacy page and `PRIVACY.md`.

The reference host's definitions write their text as message keys, so each key is added to `MessageKey`, `EN_GB_CATALOGUE` (with the exact English) and `EXPECTED_PLACEHOLDERS` in `packages/core/src/lint/messages.test.ts`, and to each of the site's translations (`packages/web/src/i18n/af.ts`), which typecheck holds complete.

Run `npx --no-install vitest run packages/web/src/layers`: the definition-loop test checks the schema, the fixture, the Content Security Policy and the credit, and names the line to add for anything missing.

On the reference site, adding a dataset is the maintainer's decision. The `review-layer` skill (`.claude/skills/review-layer/SKILL.md`) is the checklist for a proposed or changed layer: the provider's terms and attribution wording, direct browser access, what the provider learns about a visitor, the origins, failure behaviour and the text. It prepares the review and the questions for the maintainer; it does not add a layer.

## Add a routing provider

The reference site uses the public Valhalla server run by FOSSGIS, under [its usage terms](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen) (in German). To add or replace a provider on the site:

1. Implement `RoutingProvider` from `@mapcairn/core` in `packages/web/src/adapters/routing`, as [Extend the SDK](extending.md#add-a-routing-provider) describes. Keep to the service's usage limits inside the adapter, for example with `RequestSpacer` from `adapters/shared`, and send no cookies. Send a referrer only where the service's terms ask for one, and then only the site's origin, with the maintainer's decision and the privacy page and `PRIVACY.md` updated to say so: `ValhallaRoutingProvider` sets `referrerPolicy: "strict-origin"` for the public Valhalla server, which asks for a valid Referer, and a browser never puts the address fragment (where the map view and the pin are kept) in a Referer.
2. Run `runRoutingProviderContract` against it with a scripted `fetch`, as `ValhallaRoutingProvider.test.ts` does, and add recorded sample responses as fixtures. Read every body, an error body included, through a bounded reader like `readJsonWithin`, and make the contract subject lower the limit so `respondWithOversizeAnswer()` stays small: an answer over the limit must fail as `invalid`.
3. Register it as `routing` in `createServices()`.
4. Allow its origin in `connect-src` in `packages/web/public/_headers` and `constants/securityHeaders.ts`, name the service on the privacy page and in `PRIVACY.md` and `ATTRIBUTIONS.md`, and pass its credit and a note about what a request sends to the Directions panel (`routingCredits` in `packages/web/src/constants/routingCredits.ts`, which takes the link text for Fix the map from the catalogue, and the `host.notes.routing` message).

What the public Valhalla server needs: OpenStreetMap attribution and a link to <https://www.openstreetmap.org/fixthemap>, no more than one request a second, a contact address for the site, a User-Agent that identifies the application (an unmodified browser's is enough) and, where possible, a Referer. It may not be used for bulk downloads or by a high-traffic site, commercial use is allowed only when routing is not a substantial part of the offering, and it has no availability guarantee and may change or end without notice. A host that is commercial, has high traffic or needs the service to stay up should run its own [Valhalla](https://github.com/valhalla/valhalla) (MIT licensed) or pay for a routing service, and pass that address as `endpoint` to `ValhallaRoutingProvider`, or write its own adapter.

## Add search suggestions

The reference site's suggestions come from `PhotonSuggestionProvider` in `packages/web/src/adapters/search`. To change it or add another:

1. Implement `SuggestionProvider` from `@mapcairn/core` in `packages/web/src/adapters/search`. Give each request a timeout, keep to the service's usage limits inside the adapter with `RequestSpacer`, and send no cookies or referrer.
2. Run `runSuggestionProviderContract` against it with a scripted `fetch`, as `PhotonSuggestionProvider.test.ts` does.
3. Register it as `suggestions` in `createServices()`.
4. Allow its origin in `connect-src`, and say on the privacy page and in `PRIVACY.md`, `ATTRIBUTIONS.md` and the host's Settings note (`host.notes.privacy` in `EN_GB_CATALOGUE` and each language's catalogue) that the text typed so far goes to it as the person types. That is more than a submitted search sends, so the text must say it plainly.

The reference host points at the public Photon server, `https://photon.komoot.io`. Its operator states only that clients should be fair and publishes no terms for commercial use. A host that is commercial, or that expects real traffic, should run its own Photon server on OpenStreetMap data and pass its address to the adapter, `new PhotonSuggestionProvider({ endpoint: "https://photon.example.org/api/" })`, with that origin in `connect-src`. The SDK packages do not name the public server and carry no terms of it.

## Add a language

1. Add `packages/web/src/i18n/<tag>.ts` exporting a `Record<MessageKey, string>` (or a `Partial` for work in progress), and a loader for the tag in `hostLanguages.ts`. If the host also supplies layer-template translations, keep them in a separate module and load both modules on demand, leaving the `MessageKey` module with its single catalogue export.
2. Add the language to `OFFERED_LANGUAGE_OPTIONS` with its name in that language.
3. Keep every placeholder the English text has, spelled the same, in each form. Supply the categories your language needs, even when the English value has only one form. `packages/core/src/lint/messages.test.ts` checks English placeholders and categories against `MessageParams`; the Afrikaans test (`packages/web/src/i18n/af.test.ts`) runs `checkMessageCatalogue` against English, with a short list of keys allowed to match English, each with a reason. Give a new language a test like it. A complete `Record<MessageKey, string>` also makes `npm run typecheck` fail when a key is added without its translation.
4. Look up interface text through the catalogue. `packages/core/src/lint/hardcodedCopy.test.ts` checks inline interface text in `.tsx` files under `packages/map/src` and `packages/web/src`; it does not check `.ts` string tables or props of SDK components, so look those up yourself. Its exceptions are in `scripts/copy-check/allowlist.mjs`.
5. Keep an accessible name containing its visible label, which a translation keeps by using the same key for both.
6. Run the layout and accessibility specs in the new language: add the language's catalogue to `e2e/support/language.ts` and a pair of projects like `af-chromium` and `af-mobile-chromium` in `playwright.config.ts`, which run the collision and accessibility specs with the `language` option set, and extend `e2e/i18n.spec.ts`. The page object finds the chrome by the names in the active catalogue. Translated text is often longer, so check that nothing collides or truncates.
7. A person who speaks the language fluently reviews the catalogue before it ships. A machine translation is a draft, and the pull request says who reviewed it. Credit the translators in [`ATTRIBUTIONS.md`](https://github.com/MapCairn/mapcairn/blob/main/ATTRIBUTIONS.md).

The reference site's language options are in `packages/web/src/i18n/offeredLanguageOptions.ts`, its loaders in `hostLanguages.ts`, and its Afrikaans catalogue in `af.ts`, imported on demand. The Afrikaans wording of its keyed layer templates is in `afLayerTemplates.ts`, loaded together with `af.ts` and passed as `layerTemplates`. English and Afrikaans are the languages the site offers. The Arabic, `en-XA` and `en-XB` catalogues are test data, offered only to the end-to-end build, and the Arabic sample has not been reviewed by a person who speaks Arabic. The reference host sets `<html lang>` and `<html dir>` in `packages/web/src/root.tsx` and `packages/web/src/routes/app.tsx`, and from the stored tag before first paint with its inline theme script. Its error page (`packages/web/src/app/useErrorPageMessages.ts`) reads the stored choice and the browser's languages itself, because an error boundary that replaces the route supplying the services cannot read `Settings.language`.

### Check the layout in sample languages

Three sample languages, in `packages/web/e2e/support/language.ts`, stand in for a translation nobody has written yet. The end-to-end build offers them to the page through the test seam (`window.__MAPCAIRN_TEST_LANGUAGES__`, read in `packages/web/src/composition/testSeam.ts` and absent from a production build), and the reference site does not list them.

- `en-XA`: English with accents, each form about 40 percent longer. Placeholders, plural separators and category names are kept, so the app reads it as English. The generator is `e2e/support/pseudoLocale.ts`, and `src/e2ePseudoLocale.test.ts` runs `checkMessageCatalogue` against English on its output.
- `en-XB`: English with every form isolated as right-to-left text, on a page whose direction is right to left (the option's `direction`), so left-to-right words and numbers sit inside right-to-left text.
- `ar`: a small Arabic sample (`e2e/support/arabicSample.ts`): right-to-left, joined letters, six plural categories and Arabic-Indic digits. The keys it leaves out fall back to English.

The Playwright projects `expanded-chromium`, `expanded-mobile-chromium`, `mirrored-*` and `arabic-*` run `e2e/sample-languages.spec.ts` with each one chosen. In every chrome state, at 320 by 568, 844 by 390 and 1280 by 720, it checks that no control collides with another or leaves the screen, that no text is cut off by an ancestor that clips (`e2e/support/clipped.ts`) and that the page took the sample's language and direction, and, in a separate test, the axe and control audits. Separate tests check that the search pill's placeholder and the Directions place search's placeholder fit. A failure names the text and by how many pixels it is cut. The collision and cut-off tests run with `npm run e2e`; the axe test is tagged `@a11y` and runs with `npm run a11y`. The projects run 45 tests, about 2.4 minutes with one worker, and 15 more are marked `fixme` for #395. Playwright gives each shard a contiguous run of the project list, so `playwright.config.ts` places the three languages apart to spread them over three shards (about 50 seconds each). Check with `CI=1 npx playwright test --list --shard=<n>/4` after adding projects.

Right-to-left checks also run in the `rtl-chromium` and `rtl-mobile-chromium` projects, which run the basemap, keyboard, sheet and app-shell specs with `dir="rtl"`. The padding that keeps a fitted feature clear of a side panel is checked in `reveal.test.ts` (`packages/map/src/layers`) and in `e2e/rtl.spec.ts`, in both right-to-left projects. The harmony scanner fails a physical CSS property. A unit test, `packages/web/src/designGuide/iconMirroring.test.ts`, checks the icons. Each icon the app imports has an entry in `iconMirroring.ts`, `mirrors` for one that points along the reading direction (a back arrow, previous and next chevrons, undo and redo) or `fixed` for the rest, with a reason. The test fails when a new icon has no entry, and when the code draws an icon with `mirrorInRtl` against its entry. When you add an icon, add its entry and pass `mirrorInRtl` if it mirrors. The reference host resolves the offered directions in its Vite configuration and embeds them in the build, and passes them to `buildThemeBootstrapScript`, so the pre-paint script does not need `Intl`. Recompute its CSP hash in both header files after changing the offered languages or the script.

### What the repository translates

Only text that shows in the host app is translated, with one decided exception: the product page at `/` is in British English only, because it is developer-facing and closer to documentation than to interface. Its text is in its own code (`packages/web/src/product/productContent.ts`), it is listed in the copy check's allowlist, and its route keeps `<html lang="en-GB">` whatever language the playground was set to (a `PageLanguageHandle` in `i18n/pageLanguage.ts`). Markdown files (`PRIVACY.md`, `README.md`, the guides) stay English only, and `PRIVACY.md` stays the English source of the privacy page.

- The privacy page shows in the app, so it is catalogue text: the `privacy.*` keys hold its headings and paragraphs. A placeholder in a paragraph (`{link}`, `{themeKey}`) stands for a link or a `<code>` span that `PrivacyPage.tsx` supplies through `MessageParts` (`packages/web/src/i18n/MessageParts.tsx`), so a translator moves the markup with the sentence. Keep every placeholder and the facts, names, numbers and addresses of the English text. A test (`PrivacyPage.language.test.tsx`) fails when the two languages differ in headings, paragraphs, links or code spans, and `PrivacyPage.markup.test.tsx` pins the English page.
- The tab title follows the language: a route exports a `handle` naming the catalogue key of the page's name (`PageTitleHandle` in `i18n/pageTitle.ts`), and `DocumentTitle` sets `document.title` from it once the app runs. The server render, the meta description and the other tags that only crawlers and link previews read stay English.
- The developer design guide, which exists only in development and test builds, and the WebMCP tool text (it is for agents, not visitors) stay English.
- The hidden keyboard instructions are catalogue text. Each line is `host.map.keyInstruction` ("keys: description."), and the description is used exactly as written, so write it as a complete sentence with its own capital and no trailing full stop; no code changes the case of translated text.
- The short notes in Settings, Directions and the pin card that say what each service receives are catalogue keys, and a test keeps the facts in them in step with the privacy page.
