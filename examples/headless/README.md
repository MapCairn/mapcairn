# `@mapcairn/example-headless`

A plain TypeScript page, built with Vite, that draws a map with `@mapcairn/core` and `@mapcairn/adapter-maplibre` and nothing else from this repository: no React, no `@mapcairn/map`, no `@mapcairn/react` and no umbrella. It creates the map through the adapter, shows a basemap and lets the visitor choose any built-in one, draws a data layer of three invented points, listens to the view and to taps on the points, shows the credits, and takes the map down when the page is unloaded. The interface around the map (a basemap choice, a status line, the keys) is a few lines of the page's own code, because the SDK's interface is not in this route.

The basemap picker lists every basemap in `BASEMAPS`, so choosing one makes the visitor's browser contact its provider: OpenFreeMap (`tiles.openfreemap.org`), VersaTiles (`tiles.versatiles.org`) or the OpenStreetMap Foundation (`tile.openstreetmap.org`). An app of your own lists only the basemaps whose terms and privacy it accepts. Enter names the places at the centre of the map, and the page follows the system's reduced motion setting while it is open.

It builds against the packages' `dist` (each script builds them first with `npm run build:sdk`).

```bash
npm run dev -w @mapcairn/example-headless
npm test -w @mapcairn/example-headless
```

`src/headlessMap.ts` holds the work with the map and takes the adapter and a small `Page` interface, so `src/headlessMap.test.ts` runs it against `FakeMapAdapter` with no browser. `src/main.ts` is the wiring to the document and to the real adapter.

[Build a map without React](https://docs.mapcairn.com/guides/without-react/) walks through the files, and a documentation test fails when a block on that page stops matching them. The release's consumer check copies this folder, apart from its manifest, tests and test setup, into an empty app that lists only `core`, the adapter and `maplibre-gl`, installs the packed packages, and fails if the install holds React or an interface package or if the page does not type-check and build.
