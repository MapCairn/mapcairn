---

title: Embed a map
sidebar_label: Embed a map
description: What each part of the Get started app does, what a strict Content Security Policy needs, and how another bundler serves the worker file.
---

# Embed a map

What each part of the app from [Get started](../get-started.md) is for, and what to change to make it your own. The files are on that page and are not repeated here.

## What each part does

- `ServicesProvider` holds the services: search, storage, the map adapter and the rest. `createFakeServices()` gives in-memory ones, with the map adapter passed in, so search shows sample results until you add a search adapter. Where the app builds them is the composition root.
- `createMapLibreMapAdapter` draws the map with MapLibre GL JS. An adapter is the code that fills one port, an interface the SDK defines for something outside it. This one needs the address of the engine's worker file, which a Vite app gets from the `?worker&url` import.
- `LiveRegionProvider` adds the one live region, a hidden area that screen readers read announcements from. `TooltipProvider` adds the tooltips.
- `MapView` is the map region, with keyboard control and focus. `MapChrome` lays out everything over the map in slots, named places such as `topStart` and `bottomEnd`; here the search box fills `topStart`, inside `FocusRegistryProvider`.
- `defaultBasemapFor(basemaps, resolved)` picks Bright in the light theme and Fiord in the dark theme, so the map and its placeholder colour agree in both. To show one basemap in every theme, pass `basemaps.resolve(id)` instead and leave `useTheme` out; an id the catalogue does not hold gives its default. Both basemaps are served by a public tile provider (OpenFreeMap), so choose the basemap whose terms and privacy you accept.

## Types for Vite

The first line of `main.tsx`, `/// <reference types="vite/client" />`, gives TypeScript the types of the `?worker&url` import and of a plain CSS import. The `react-ts` template already lists `vite/client` in its `tsconfig`, so the line only matters when your project does not. Without the types, `tsc --noEmit` reports TS2307 for the worker import and TS2882 for `import "./page.css"` when `noUncheckedSideEffectImports` is on.

## Another bundler

Serve `maplibre-gl/dist/maplibre-gl-worker.mjs` as a same-origin file and resolve `loadWorkerUrl` to its address. The adapter makes no request until a map mounts, and then asks only for what the basemap you pass `MapView` names.

## Under a strict Content Security Policy

The Get started app needs only the default basemaps' origin, `https://tiles.openfreemap.org`, in `connect-src` and `img-src`, with the worker served from the page's own origin. A line to start from:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:
```

[Content Security Policy](content-security-policy.md) says what each directive is for, including when `worker-src` needs `blob:`.

## Next

- [Extending MapCairn](extending.md) lists what an app provides around the SDK and how to add a basemap, a data layer, a search or routing provider, or an adapter of your own.
- [`examples/embed`](https://github.com/MapCairn/mapcairn/blob/main/examples/embed/README.md) is the full version of this app, with the end stack of controls, the sheet, the measure tool, layers and a search provider of its own.
