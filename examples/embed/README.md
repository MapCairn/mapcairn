# `@mapcairn/example-embed`

A one-page Vite and React app that uses the SDK the way an outside app does: it imports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` by package name and nothing else from this repository. It runs on the SDK's fakes, so it requests nothing and loads no map engine. [`docs/guides/extending.md`](../../docs/guides/extending.md) says what it proves and what an app of your own provides.

```bash
npm run dev -w @mapcairn/example-embed
npm test -w @mapcairn/example-embed
```

## Layers

The example's layers come from a runtime layer catalogue, built by `createExampleCatalogue` in `src/exampleServices.ts`.

| File                        | What it holds                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cairnsLayer.ts`        | One layer written by hand, as an outside app would write it, and the features the fake layer source returns for it.                                                                         |
| `src/serverMetadata.ts`     | The types of a made-up server's layer metadata: ids, titles, geometry types, field lists, renderers (unique values, class breaks, equal intervals), a feature or tile service and a credit. |
| `src/sampleServerLayers.ts` | That server's answer for four layers, a constant that nothing requests, and the features the fake source returns for two of them.                                                           |
| `src/mapServerLayers.ts`    | The sample mapper: server metadata to layer definitions. Read [Supply layers at runtime](../../docs/guides/extending.md#supply-layers-at-runtime) for what it maps.                         |

One of the four sample layers, `survey-notes`, has no text field to title a feature with, so the catalogue skips it and the example logs the reason to the console, one line with the path of each problem.
