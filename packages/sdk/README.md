# `@mapcairn/sdk`

[![npm version](https://img.shields.io/npm/v/@mapcairn/sdk)](https://www.npmjs.com/package/@mapcairn/sdk)
[![GitHub Release](https://img.shields.io/github/v/release/MapCairn/mapcairn)](https://github.com/MapCairn/mapcairn/releases)

The whole MapCairn SDK from one import: it re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` from its root, and the MapLibre adapter, `@mapcairn/adapter-maplibre`, at the subpath `@mapcairn/sdk/adapter-maplibre`, so an app learns one package name instead of five. It is the recommended install. The individual packages are the advanced option, for a host that wants fewer dependencies: `core` has no React or browser dependency, and `theme` installs without the interface.

**Status:** pre-1.0. While the version starts with `0.`, a minor release (the middle number) can contain a breaking change to the public API and a patch release (the last number) is not meant to, so a caret range takes patch releases but not the next minor release. The [changelog](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md) names each breaking change the release finds, and [what counts as the public API](https://docs.mapcairn.com/guides/public-api/) says what is covered.

## Install

```bash
npm install @mapcairn/sdk react react-dom maplibre-gl
pnpm add @mapcairn/sdk react react-dom maplibre-gl
yarn add @mapcairn/sdk react react-dom maplibre-gl
```

React and React DOM 19 are peer dependencies, and your app already has them; the install line lists them because strict pnpm and Yarn want peers listed. `maplibre-gl` (`^6.18.0`) is a required peer too, because the adapter at the subpath needs it: npm and recent pnpm install it for you, and strict pnpm and Yarn ask you to list it, as they do for React. The root of the package never imports the engine, so an app that does not import the subpath has none in its page or its server bundle. The package is ESM only: it has no `main` field and no CommonJS build. A TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`; `node10` is not supported. `vitest` is an optional peer, needed only for `@mapcairn/sdk/core/contracts`. [Supported versions](https://docs.mapcairn.com/guides/supported-versions/) lists the React, MapLibre, browser and package manager versions that are tested.

## Usage

Import the stylesheet once, then what you need from the one package. The adapter comes from its subpath:

```tsx
import "@mapcairn/sdk/styles.css";
import { MapChrome, ServicesProvider } from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
```

[Get started](https://docs.mapcairn.com/get-started/) has a whole app that draws a map, with the engine's worker file.

### A page with no React

`@mapcairn/sdk/browser` draws a map on a plain page or a server-rendered one, with no React written and no build step. It is not in `0.2.0` or any earlier release, so after an install of one of those the subpath and its files are not there. [A map on a server-rendered page, without React](https://docs.mapcairn.com/guides/browser-route/) is the guide. The `<mapcairn-map>` element is a standard custom element; no front-end framework has been tried with it.

Serve `browser.css`, `browser.js` and the `browser-*.js` files in `node_modules/@mapcairn/sdk/dist` from your own site, and give the map a height in CSS. The peers (`react`, `react-dom` and `maplibre-gl`) install but are never loaded by such a page, and their ranges are still checked: a project on React 18 gets `ERESOLVE` from npm. Give each of several maps on a page its own `label`. A tag is enough:

```html
<link rel="stylesheet" href="/mapcairn/browser.css" />
<script type="module" src="/mapcairn/browser-element.js"></script>
<mapcairn-map></mapcairn-map>
```

or one call. A Content Security Policy that allows no inline script needs the call in a file of your own:

```html
<script type="module">
  import { mountMap } from "/mapcairn/browser.js";
  mountMap(document.getElementById("map"));
</script>
```

`<mapcairn-map>` takes the attributes `latitude`, `longitude`, `zoom`, `bearing`, `basemap`, `theme`, `label`, `language` and `tools` (tool names separated by spaces). The first six change the map that is showing. A change to `label`, `language` or `tools` draws the map again, and so does a new value for `services`, `basemaps`, `layers` or `languages`; drawing it again keeps the view and resets what a person chose in the map, such as the basemap or the language. A new object with the same data is not a change, but keep the objects you pass the same from one render to the next where you can. The objects an attribute cannot hold are properties: `services`, `basemaps`, `layers`, `languages` and `view`, and `map` is the handle `mountMap` returns. Load `browser-element.js` before your page or app sets an object on the element, because an element that is not defined yet takes an object as text. The element sends `mapcairn-view-change`, `mapcairn-click`, `mapcairn-feature-tap` and `mapcairn-error` events, with what happened in `detail`. A mistake in what you gave the element, such as a tool name that is not one, comes as `mapcairn-error` and a line in the console that says what to change. Nothing is written back to an attribute.

```js
const element = document.querySelector("mapcairn-map");
element.addEventListener("mapcairn-view-change", (event) => console.log(event.detail.zoom));
element.services = { search: mySearchProvider };
```

`defineMapElement("my-map")` from `browser.js` registers the element under another name; give that name `display: block` in your CSS, because the stylesheet does it for `mapcairn-map` only.

`HTMLElementTagNameMap` knows `mapcairn-map`, so TypeScript types `document.querySelector("mapcairn-map")`. A React project that wants `<mapcairn-map>` in JSX adds `import "@mapcairn/sdk/browser/react-jsx";` once, which types the attributes, the properties and the events (`onmapcairn-click` and the others). This route has the built-in basemaps or your own, tile layers from definitions, measuring, settings kept in the page's memory, and the accessible interface. Search and Locate me appear when the page supplies a provider. The map needs `worker-src blob:` in a strict Content Security Policy, which Safari supports from 15.5; the [policy for this route](https://docs.mapcairn.com/guides/content-security-policy/#the-browser-route) lists every directive, and [`examples/browser`](https://github.com/MapCairn/mapcairn/tree/main/examples/browser) is a page that runs under it.

## Next steps

- Read [Get started](https://docs.mapcairn.com/get-started/) on the documentation site, which also has a page for each common task and the API reference.
- [Show a real map](https://docs.mapcairn.com/guides/extending/#show-a-real-map): the adapter, the engine's worker file and a basemap.
- [Theme the interface with your own colours](https://docs.mapcairn.com/guides/extending/#theme-the-sdk-with-your-own-colours), checked against WCAG 2.2 AA.
- [Translate the interface](https://docs.mapcairn.com/guides/translate-the-sdk/) or offer a choice of languages.
- [Write a search provider](https://docs.mapcairn.com/guides/extending/#write-a-search-provider).
- [Add a routing provider](https://docs.mapcairn.com/guides/extending/#add-a-routing-provider).
- [Add a data layer](https://docs.mapcairn.com/guides/extending/#add-a-data-layer).
- Read the [Content Security Policy guide](https://docs.mapcairn.com/guides/content-security-policy/) before you deploy.
- Try the [playground](https://mapcairn.com/map), and read [`examples/embed`](https://github.com/MapCairn/mapcairn/tree/main/examples/embed), a whole app written against the packages.

## What it exports

| Entry point                        | Same as                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `@mapcairn/sdk`                    | every export of the four packages below, from one flat list  |
| `@mapcairn/sdk/core`               | `@mapcairn/core`                                             |
| `@mapcairn/sdk/core/contracts`     | `@mapcairn/core/contracts`                                   |
| `@mapcairn/sdk/map`                | `@mapcairn/map`                                              |
| `@mapcairn/sdk/adapter-maplibre`   | `@mapcairn/adapter-maplibre`, only at this subpath           |
| `@mapcairn/sdk/react`              | `@mapcairn/react`                                            |
| `@mapcairn/sdk/theme`              | `@mapcairn/theme`                                            |
| `@mapcairn/sdk/styles.css`         | the three stylesheets, in order                              |
| `@mapcairn/sdk/browser`            | `mountMap(element)`, a map for a page with no React          |
| `@mapcairn/sdk/browser/styles.css` | that map's stylesheet, `browser.css`                         |
| `@mapcairn/sdk/browser/element`    | registers `<mapcairn-map>` when it is imported               |
| `@mapcairn/sdk/browser/react-jsx`  | lets JSX accept `<mapcairn-map>`; add it only if you want it |

Each entry point that stands for a package is an `export * from` it, never a copy, so a type from the umbrella is the same type as the package's own. The contract suites are not in the root, because they import a test runner.

Two names are declared by more than one of the four packages, and the root settles them:

- `ScaleBar` is the component from `@mapcairn/map`. `@mapcairn/core` declares the measurement as a type of the same name, which stays reachable at `@mapcairn/sdk/core`.
- `ReadingDirection` is the type from `@mapcairn/core`. `@mapcairn/react` declares the same `"ltr" | "rtl"` type again.

A new name that two packages declare fails the type check until the umbrella settles it.

## Dependencies and declaration merging

The umbrella depends on the four packages and the adapter at one exact version, and the six packages are released together. If your app also imports one of them directly, keep it at the umbrella's version, or you get two copies of it. Two copies each have their own React context, so a component from one copy does not see a `ServicesProvider` from the other.

A host that adds a service of its own by declaration merging augments `@mapcairn/core` directly (`declare module "@mapcairn/core"`), and lists `@mapcairn/core` as a dependency at the umbrella's version.

## Licence

`@mapcairn/sdk` is licensed under AGPL-3.0-only, an open-source licence that allows commercial use, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/sdk/LICENSE) comes with the package. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the code you combine with the SDK and serve with it, under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. [What the licence means for your project](https://docs.mapcairn.com/guides/licence/) says it in plain words and is not legal advice. The SDK packages depend only on permissively licensed packages. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Ask a question in [Discussions](https://github.com/MapCairn/mapcairn/discussions). Report a security problem privately, as [`SECURITY.md`](https://github.com/MapCairn/mapcairn/blob/main/.github/SECURITY.md) explains, not in an issue. Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/.github/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
