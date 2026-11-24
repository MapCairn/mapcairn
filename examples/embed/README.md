# `@mapcairn/example-embed`

A one-page Vite and React app that uses the SDK the way an outside app does: it imports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` by package name and nothing else from this repository. It runs on the SDK's fakes, so it requests nothing and loads no map engine. Its search runs over a few invented places held in memory. [Extending MapCairn](https://mapcairn.timothybrits.co.za/docs/guides/extending/) says what an app of your own provides.

It builds against the packages' `dist` (each script builds them first with `npm run build:sdk`) and needs no vanilla-extract plugin: `src/main.tsx` imports `@mapcairn/theme/tokens.css` and `@mapcairn/map/styles.css`, and `src/page.css` is a plain stylesheet whose rules (a box model, the page height, the grid that holds the two maps) change no primitive, so it needs no cascade layer (see the extending guide for an app whose base styles do).

```bash
npm run dev -w @mapcairn/example-embed
npm test -w @mapcairn/example-embed
```

## Two themed maps

The page shows two maps, each inside a wrapper with its own class (`map-pine` and `map-heather`), with a different accent colour and typeface. `src/exampleThemes.ts` holds the two themes and calls `createThemeStylesheet` once for each, with the class as its scope, and joins the results into one stylesheet. `src/themeStylesheetPlugin.ts` serves that text as `example-themes.css`, in the dev server and in the build, and links it after the SDK's stylesheet. It is a file, never an inline `<style>`, so a policy with `style-src 'self'` allows it, and a theme below WCAG 2.2 AA fails the build with an error. The faces are families a device already has, so no font file is loaded. `src/exampleThemes.test.ts` fails if the stylesheet stops holding the rules of either scope. Light and dark stay one choice for the whole page: the SDK reads `data-theme` from the document element, so both maps follow it together.

## Layers

The example's layers come from a runtime layer catalogue, built by `createExampleCatalogue` in `src/exampleServices.ts`.

| File                        | What it holds                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cairnsLayer.ts`        | One layer written by hand, as an outside app would write it, and the features the fake layer source returns for it.                                                                             |
| `src/serverMetadata.ts`     | The types of a made-up server's layer metadata: ids, titles, geometry types, field lists, renderers (unique values, class breaks, equal intervals), a feature or tile service and a credit.     |
| `src/sampleServerLayers.ts` | That server's answer for four layers, a constant that nothing requests, and the features the fake source returns for two of them.                                                               |
| `src/mapServerLayers.ts`    | The sample mapper: server metadata to layer definitions. Read [Supply layers at runtime](https://mapcairn.timothybrits.co.za/docs/guides/extending/#supply-layers-at-runtime) for what it maps. |

One of the four sample layers, `survey-notes`, has no text field to title a feature with, so the catalogue skips it and the example logs the reason to the console, one line with the path of each problem.

## Search

The example supplies a search provider and a suggestion provider of its own, so the search pill, its suggestions and the move to a result work with no service. They are written as a host would write them for a plain JSON place service, and they run against a local `fetch` that answers from memory.

| File                      | What it holds                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/placeSearch.ts`      | `PlaceSearchProvider` and `PlaceSuggestionProvider`: the request, the mapping of an item to a `SearchResult`, and the errors the ports allow. Also the local `fetch`. |
| `src/samplePlaces.ts`     | Five invented places, two with an extent. They name nothing real.                                                                                                     |
| `src/showResult.ts`       | Moves the map to a picked result: fits its extent when it has one, otherwise centres on its point.                                                                    |
| `src/placeSearch.test.ts` | Runs the SDK's `runSearchProviderContract` and `runSuggestionProviderContract` against the providers, through `@mapcairn/core/contracts`.                             |

[Write a search provider](https://mapcairn.timothybrits.co.za/docs/guides/extending/#write-a-search-provider) explains each part and what to tell visitors. The example does not mount the pin card, so nothing on its page calls `reverse`; the contract suite and the tests cover it.

## Content Security Policy

`src/contentSecurityPolicy.ts` builds a strict Content-Security-Policy header from the basemaps and layers a host offers, reading each origin from the definitions with `@mapcairn/core`. The example page does not send it, because the example requests nothing. [Content Security Policy](https://mapcairn.timothybrits.co.za/docs/guides/content-security-policy/) says what it adds and what a host passes in itself.
