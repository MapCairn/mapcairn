# `@mapcairn/sdk`

The whole MapCairn SDK from one import: it re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` from its root, and the MapLibre adapter, `@mapcairn/adapter-maplibre`, at the subpath `@mapcairn/sdk/adapter-maplibre`, so an app learns one package name instead of five. It is the recommended install, and it holds no code of its own. The individual packages are the advanced option, for a host that wants fewer dependencies: `core` has no React or browser dependency, and `theme` installs without the interface.

**Status:** pre-1.0. While the version starts with `0.`, a minor release (the middle number) can contain a breaking change to the public API and a patch release (the last number) is not meant to, so a `^0.1.0` range takes patch releases but not the next minor release. The [changelog](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md) names each breaking change the release finds, and [what counts as the public API](https://mapcairn.timothybrits.co.za/docs/guides/public-api/) says what is covered.

## Install

```bash
npm install @mapcairn/sdk react react-dom maplibre-gl
pnpm add @mapcairn/sdk react react-dom maplibre-gl
yarn add @mapcairn/sdk react react-dom maplibre-gl
```

React and React DOM 19 are peer dependencies, and your app already has them; the install line lists them because strict pnpm and Yarn want peers listed. `maplibre-gl` (`^6.18.0`) is a required peer too, because the adapter at the subpath needs it: npm and recent pnpm install it for you, and strict pnpm and Yarn ask you to list it, as they do for React. The root of the package never imports the engine, so an app that does not import the subpath has none in its page or its server bundle. The package is ESM only: it has no `main` field and no CommonJS build. A TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`; `node10` is not supported. `vitest` is an optional peer, needed only for `@mapcairn/sdk/core/contracts`.

## Usage

Import the stylesheet once, then import what you need from the one package:

```tsx
import "@mapcairn/sdk/styles.css";
import { MapChrome, ServicesProvider } from "@mapcairn/sdk";
```

For a real map, add the adapter from its subpath. It needs the URL of the engine's worker, as the [adapter's README](https://github.com/MapCairn/mapcairn/tree/main/packages/adapter-maplibre) explains. [Show a real map](https://mapcairn.timothybrits.co.za/docs/guides/extending/#show-a-real-map) has the steps and the Vite form:

```ts
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
```

The [repository README's "Embed a map"](https://github.com/MapCairn/mapcairn#embed-a-map) shows a whole app that draws a map: `index.html`, a style sheet that gives the page a height, and `main.tsx`, which a test compiles as written. In a Vite project, start `main.tsx` with `/// <reference types="vite/client" />` (or list `vite/client` under `types` in `tsconfig.json`; Vite's `react-ts` template already does), or `tsc --noEmit` fails on the worker URL import and the CSS import. Under a strict Content Security Policy the default basemap needs `https://tiles.openfreemap.org` in `connect-src` and `img-src`, and the worker from the page's own origin in `worker-src`; the README has a policy line to start from. A Vite 8 build prints `"use client"` warnings (`MODULE_LEVEL_DIRECTIVE`) from the Radix UI packages that `@mapcairn/map` depends on; they are expected and harmless.

`@mapcairn/sdk/styles.css` is three `@import` lines: the tokens from `@mapcairn/theme`, the styles of `@mapcairn/map`, then the engine styles of `@mapcairn/adapter-maplibre`. A host that links stylesheets without a bundler keeps using `@mapcairn/theme/tokens.css` and `@mapcairn/map/styles.css`, and adds `@mapcairn/adapter-maplibre/styles.css` for a real map. [`@mapcairn/map`](https://github.com/MapCairn/mapcairn/tree/main/packages/map) shows a whole app, which works the same with these imports.

## Next steps

- [Show a real map](https://mapcairn.timothybrits.co.za/docs/guides/extending/#show-a-real-map): the adapter, the engine's worker file and a basemap.
- [Theme the interface with your own colours](https://mapcairn.timothybrits.co.za/docs/guides/extending/#theme-the-sdk-with-your-own-colours), checked against WCAG 2.2 AA.
- [Translate the interface](https://mapcairn.timothybrits.co.za/docs/guides/translate-the-sdk/) or offer a choice of languages.
- [Write a search provider](https://mapcairn.timothybrits.co.za/docs/guides/extending/#write-a-search-provider).
- [Add a routing provider](https://mapcairn.timothybrits.co.za/docs/guides/extending/#add-a-routing-provider).
- [Add a data layer](https://mapcairn.timothybrits.co.za/docs/guides/extending/#add-a-data-layer).
- Read the [Content Security Policy guide](https://mapcairn.timothybrits.co.za/docs/guides/content-security-policy/) before you deploy.
- Try the [playground](https://mapcairn.timothybrits.co.za/map), and read [`examples/embed`](https://github.com/MapCairn/mapcairn/tree/main/examples/embed), a whole app written against the packages.

## What it exports

| Entry point                      | Same as                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `@mapcairn/sdk`                  | every export of the four packages below, from one flat list |
| `@mapcairn/sdk/core`             | `@mapcairn/core`                                            |
| `@mapcairn/sdk/core/contracts`   | `@mapcairn/core/contracts`                                  |
| `@mapcairn/sdk/map`              | `@mapcairn/map`                                             |
| `@mapcairn/sdk/adapter-maplibre` | `@mapcairn/adapter-maplibre`, only at this subpath          |
| `@mapcairn/sdk/react`            | `@mapcairn/react`                                           |
| `@mapcairn/sdk/theme`            | `@mapcairn/theme`                                           |
| `@mapcairn/sdk/styles.css`       | the three stylesheets, in order                             |

Each entry point is an `export * from` the package, never a copy, so a type from the umbrella is the same type as the package's own. The contract suites are not in the root, because they import a test runner.

Two names are declared by more than one of the four packages, and the root settles them:

- `ScaleBar` is the component from `@mapcairn/map`. `@mapcairn/core` declares the measurement as a type of the same name, which stays reachable at `@mapcairn/sdk/core`.
- `ReadingDirection` is the type from `@mapcairn/core`. `@mapcairn/react` declares the same `"ltr" | "rtl"` type again.

A new name that two packages declare fails the type check until the umbrella settles it.

## Dependencies and declaration merging

The umbrella depends on the four packages and the adapter at one exact version, and the six packages are released together. If your app also imports one of them directly, keep it at the umbrella's version, or you get two copies of it. Two copies each have their own React context, so a component from one copy does not see a `ServicesProvider` from the other.

A host that adds a service of its own by declaration merging augments `@mapcairn/core` directly (`declare module "@mapcairn/core"`), and lists `@mapcairn/core` as a dependency at the umbrella's version.

## Licence

`@mapcairn/sdk` is licensed under AGPL-3.0-only, an open-source licence that allows commercial use, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/sdk/LICENSE) comes with the package. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. [What the licence means for your project](https://mapcairn.timothybrits.co.za/docs/guides/licence/) says it in plain words and is not legal advice. The SDK packages depend only on permissively licensed packages. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Ask a question in [Discussions](https://github.com/MapCairn/mapcairn/discussions). Report a security problem privately, as [`SECURITY.md`](https://github.com/MapCairn/mapcairn/blob/main/SECURITY.md) explains, not in an issue. Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
