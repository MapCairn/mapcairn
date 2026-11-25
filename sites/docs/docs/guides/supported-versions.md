---

title: Supported versions
sidebar_label: Supported versions
description: The browsers, Node, React, MapLibre and package managers the SDK supports, and which of them a test covers.
---

# Supported versions

One page for what the SDK is built and tested against. A version outside the table may work, but nothing here proves it.

## What an app needs

| Part             | Supported                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| React            | `react` and `react-dom` `^19.0.0`, the peer range of every SDK package that uses React                                     |
| MapLibre GL JS   | `maplibre-gl` `^6.18.0`, a required peer of `@mapcairn/sdk` and `@mapcairn/adapter-maplibre`                               |
| Module format    | ESM only, with no CommonJS build                                                                                           |
| TypeScript       | A `moduleResolution` of `bundler`, `node16` or `nodenext`; `node10` is not supported                                       |
| Bundler          | Vite, with plain Vite and no vanilla-extract plugin; any bundler that handles a CSS import should work, none else is tried |
| Package managers | npm, pnpm (strict peers), Yarn and Bun; the consumer check installs the packed packages with each of them                  |

The SDK packages declare no Node range (`engines`). The consumer check runs on the Node the repository uses, and a server-rendered host renders on whichever Node it runs.

## What the repository needs

Working on MapCairn itself needs Node `>=24` and npm `>=11.0.0`, the `engines` in the root `package.json`. An app that only installs the SDK needs neither.

## Browsers

The browser tests of the reference site run in these projects:

- Chromium on desktop, and on a Pixel 7 profile for a phone.
- WebKit on an iPhone 15 profile, for the specs that cover the map's start-up, the basemap, the keyboard, the sheet and the app shell.
- A right-to-left layout and an Afrikaans one, in Chromium.

Firefox is not tested and not a supported target. The consumer check draws the README's quickstart in Chromium only.

## What is tested at the edges

- **React's lower edge.** The release's consumer check installs the umbrella with React and React DOM at the lowest version the peer range allows, builds the README's quickstart with plain Vite and draws it in Chromium. The repository's own tests run on the latest React the lockfile holds.
- **The stated range and the manifests.** A test fails when the React or MapLibre range on this page differs from the peer ranges of the six SDK packages, or when the Node and npm ranges differ from the root `engines`.
- **Package managers.** The consumer check installs and renders with npm (also with `--legacy-peer-deps`), strict pnpm, Yarn and Bun.

See the [README](https://github.com/MapCairn/mapcairn/blob/main/README.md) for the install line and [Embed a map](./embed-a-map.md) for a whole app.
