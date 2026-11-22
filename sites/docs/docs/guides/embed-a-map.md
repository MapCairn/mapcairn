---

title: Embed a map
sidebar_label: Embed a map
description: Install the SDK and draw a map with its interface around it, file by file.
---

# Embed a map

This page is for a developer who wants a map on a page of their own. By the end you will have a whole Vite and React app, three files, that draws a map with the SDK's interface around it and a search box at the top. The product page shows the part that mounts it; this is the rest. The code is the README's "Embed a map" example: a test type-checks it as an app outside the repository would write it, and a test keeps the code below equal to the README's.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## Install

```bash
npm install @mapcairn/sdk react react-dom maplibre-gl
```

That needs React 19, `maplibre-gl` 6.18 or later and an ESM bundler that handles CSS imports (tested with Vite), and a TypeScript `moduleResolution` of `bundler`, `node16` or `nodenext`. `@mapcairn/sdk` is the one package most apps need: the interface comes from its root and the MapLibre adapter from `@mapcairn/sdk/adapter-maplibre`, so an app that never imports the subpath carries no map engine. `maplibre-gl` is a required peer, so a strict package manager wants it listed. The individual packages are the advanced option, for a host that wants fewer dependencies; the README's "Packages" table lists them.

## The three files

A map that shows is three files in a Vite and React project: the page, a style sheet that gives the map a height, and the entry file. Together they are a whole app. It mounts the map with the SDK's interface around it and a search box at the top, and builds its services with the MapLibre adapter. The adapter needs the URL of the engine's worker file, which in a Vite app is the bundler's own worker URL import.

`index.html`:

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My map</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/page.css`. The SDK ships no base stylesheet, so the page gives the map its height and removes the body margin; without these the map is zero pixels high and nothing shows:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}
```

`src/main.tsx`:

```tsx
/// <reference types="vite/client" />
import "@mapcairn/sdk/styles.css";
import "./page.css";
import {
  createFakeServices,
  defaultBasemapFor,
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapView,
  SearchPill,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMap,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";

const services = createFakeServices({
  createMapAdapter: () =>
    createMapLibreMapAdapter({
      loadWorkerUrl: async () => {
        const worker = await import(
          "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
        );
        return worker.default;
      },
    }),
});

function App() {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <MapScreen />
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

function MapScreen() {
  const basemaps = useBasemaps();
  const { resolved } = useTheme();
  return (
    <MapView
      initialView={{
        center: { lat: -33.92, lng: 18.42 },
        zoom: 11,
        bearing: 0,
      }}
      basemap={defaultBasemapFor(basemaps, resolved)}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}

function Chrome({ background }: { readonly background: ReactNode }) {
  const map = useMap();
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={
          <SearchPill
            onSelect={(result) =>
              map.adapter?.setView({ center: result.centre, zoom: 14 })
            }
          />
        }
      />
    </FocusRegistryProvider>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page has no #root element.");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

The first line of `main.tsx`, `/// <reference types="vite/client" />`, gives TypeScript the types of the `?worker&url` import and of a plain CSS import. Vite's `react-ts` template (`npm create vite@latest -- --template react-ts`, whose `index.html` and `src/main.tsx` you replace with the two above) already lists `vite/client` in its `tsconfig` types, so the line is only needed when your project does not. Without the types, `tsc --noEmit` reports TS2307 for the worker import, always, and TS2882 for `import "./page.css"` when `noUncheckedSideEffectImports` is on, as it is by default in the TypeScript 7.0 checked here.

Search and the rest of the interface run on the SDK's in-memory fakes, so search shows sample results until you add a search adapter, and nothing but the map is requested. Another bundler must serve `maplibre-gl/dist/maplibre-gl-worker.mjs` as a same-origin file and resolve `loadWorkerUrl` to its address. The adapter makes no request until a map mounts, and then asks only for what the basemap you pass `MapView` names. The basemap shown follows the theme: `defaultBasemapFor(basemaps, resolved)` gives the built-in catalogue's Bright in the light theme and Fiord in the dark theme, so the map and its placeholder colour agree in both. Both are served by a public tile provider (OpenFreeMap), so choose the basemap whose terms and privacy you accept. To show one basemap in every theme, pass `basemaps.resolve(id)` instead and leave `useTheme` out; an id the catalogue does not hold gives the catalogue's default, Bright in the built-in one.

Under a strict Content Security Policy, this page needs only the default basemaps' origin (Bright and Fiord share it), `https://tiles.openfreemap.org`, in `connect-src` and `img-src`, with the worker served from the page's own origin. A policy line to start from, which is the one the consumer check's browser leg runs under with a mocked style, so it has not been run against the default basemap's real style:

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; font-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self' blob:
```

[`content-security-policy.md`](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/content-security-policy.md) says what each directive is for, including when `worker-src` needs `blob:`. A Vite 8 build prints 18 `"use client"` warnings (`MODULE_LEVEL_DIRECTIVE`) from the Radix UI packages that `@mapcairn/map` depends on; they are expected and harmless.

What is tested, and what is not, is in [Extending MapCairn](extending.md#show-a-real-map): a test compiles `main.tsx` as written, and the release's consumer check draws a map in Chromium from a similar app, not from this file.

## What each part does

- `ServicesProvider` holds the services: search, storage, the map adapter and the rest. `createFakeServices()` gives the in-memory services, with the adapter passed in to draw the map; search shows sample results until you add a search adapter.
- `createMapLibreMapAdapter` draws the map with MapLibre GL JS. It needs the address of the engine's worker file, which a Vite app gets from the `?worker&url` import.
- `LiveRegionProvider` and `TooltipProvider` add the one announcer for screen readers and the tooltips.
- `MapView` is the map region, with keyboard control and focus. `MapChrome` lays out everything over the map in named slots, here the search box at the top, inside `FocusRegistryProvider`.

## Next

- [Extending MapCairn](extending.md) lists what an app provides around the SDK (base styles, the font, the providers' wording) and how to show a real map with another bundler, add a basemap, a data layer, a search or routing provider, or an adapter of your own.
- [`examples/embed`](https://github.com/MapCairn/mapcairn/blob/main/examples/embed/README.md) is the full version of this app, with the end stack of controls, the sheet, the measure tool, layers and a search provider of its own.
