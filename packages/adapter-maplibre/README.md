# `@mapcairn/adapter-maplibre`

The MapLibre GL JS adapter for MapCairn's `MapAdapter` port, and the styles that fit the engine into the map region. It is the one place in the SDK that imports a map engine: `@mapcairn/map` draws the interface and asks a `MapAdapter` for the map, and this package is the adapter that draws it with MapLibre. It builds on [`@mapcairn/core`](https://github.com/MapCairn/mapcairn/tree/main/packages/core) and [`@mapcairn/theme`](https://github.com/MapCairn/mapcairn/tree/main/packages/theme) only.

**Status:** a release candidate, for early adopters. It is released with the other SDK packages from `0.1.0-rc.3`, and the reference host uses it. [Plan 0016](https://github.com/MapCairn/mapcairn/blob/main/docs/plans/0016-adapter-maplibre-package.md) describes how it joined the release. The API is still settling, so a breaking change can land before `0.1.0`; the [changelog](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md) lists each one. Until `0.1.0`, add `@next` to the package name in the install commands below.

If you install [`@mapcairn/sdk`](https://github.com/MapCairn/mapcairn/tree/main/packages/sdk), you have this package already: it re-exports it at `@mapcairn/sdk/adapter-maplibre`, and its root stays free of the map engine.

## Install

```bash
npm install @mapcairn/adapter-maplibre@next maplibre-gl
pnpm add @mapcairn/adapter-maplibre@next maplibre-gl
yarn add @mapcairn/adapter-maplibre@next maplibre-gl
```

`maplibre-gl` is a peer dependency, so the app chooses the engine version (`^6.18.0`).

## Usage

Import the engine styles once, and give the adapter the URL of the engine's worker:

```ts
import "@mapcairn/adapter-maplibre/styles.css";
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";

const createMap = () =>
  createMapLibreMapAdapter({
    loadWorkerUrl: async () => "/maplibre-gl-worker.mjs",
  });
```

A Vite app takes the URL from the bundler's own worker import, and another bundler must serve the file the same way. [Show a real map](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/extending.md#show-a-real-map) has the steps, and the [Content Security Policy guide](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/content-security-policy.md#worker-src) covers `worker-src`.

`createMap` is the adapter factory that goes in the `Services` bundle that `ServicesProvider` supplies to `@mapcairn/map`.

- `loadWorkerUrl` resolves to the URL of `maplibre-gl/dist/maplibre-gl-worker.mjs` as your app serves it. MapLibre 6 runs a module worker, and without this URL it looks for the file beside its own module, which inside a bundle names the wrong file, so the map never draws. It is a function so the adapter asks for the URL only when a map mounts, which lets a bundler load the worker lazily. A host that serves a hashed worker file with a long cache lifetime adds a key that names its Content Security Policy to the URL, so a changed policy reaches devices that already have the file.
- The adapter makes no request until a map mounts. The first mount loads the engine, its stylesheet and the worker, then the style and tiles of the basemap the app gave it, and nothing else. It has no default basemap and no origin of its own.
- `@mapcairn/adapter-maplibre/styles.css` hides the engine's own controls, sets its type and background from the design tokens and lets the engine's cursors inherit the map's. Every rule starts from the `data-map-host` attribute that `MapView` puts on the map region, so it only styles a map that `MapView` hosts. Import it once, beside the tokens and the styles of `@mapcairn/map`.
- `TILE_LAYER_SLOW_MS` is how long a tile layer may load before the adapter reports it slow. A browser test that steps a clock past it imports it from here.

The package is ESM only: it has no `main` field and no CommonJS build. A TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`; `node10` is not supported.

## Exports

| Export                                  | What it is                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `createMapLibreMapAdapter(options)`     | Builds a `MapAdapter` over MapLibre GL JS                                       |
| `MapLibreMapAdapterOptions`             | The options type: `loadWorkerUrl`, a function that resolves to the worker's URL |
| `TILE_LAYER_SLOW_MS`                    | How long a tile layer may load before it is reported slow                       |
| `@mapcairn/adapter-maplibre/styles.css` | The compiled engine styles                                                      |

The adapter class, the engine loader and the options only tests use are not exported, so they can change. The built declarations do not import `maplibre-gl`, so a project that type-checks without the engine installed still works.

## Licence

`@mapcairn/adapter-maplibre` is licensed under AGPL-3.0-only, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/adapter-maplibre/LICENSE) comes with the package. If you ship it in a product, or let people use a modified version over a network, you must publish the corresponding source under the same licence. The SDK packages depend only on permissively licensed packages, and `maplibre-gl` is BSD-3-Clause. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more, including how to talk about other terms for closed-source use.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
