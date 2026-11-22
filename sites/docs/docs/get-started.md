---

title: Get started with the MapCairn SDK
sidebar_label: Get started
description: Install the MapCairn SDK and draw a working map in a Vite and React app, with every file on this page.
slug: /
---

# Get started

This page is for a developer who wants a map on a page of their own. By the end you will have a Vite and React app, three files, that draws a map with the SDK's interface around it and a search box at the top, running on your machine.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The code on this page is compiled in CI against the built packages. It uses [`MapView`](api/map/MapView.md), [`MapChrome`](api/map/MapChrome.md), [`SearchPill`](api/map/SearchPill.md), [`ServicesProvider`](api/map/ServicesProvider.md), [`createFakeServices`](api/core/createFakeServices.md) and [`createMapLibreMapAdapter`](api/adapter-maplibre/createMapLibreMapAdapter.md).

## Before you start

You need Node 24 or newer, npm 11 or newer and a browser. The SDK needs React 19, `maplibre-gl` 6.18 or later, an ESM bundler that handles CSS imports (tested with Vite) and a TypeScript `moduleResolution` of `bundler`, `node16` or `nodenext`.

## Install

Make a Vite and React project, then add the SDK:

```bash
npm create vite@latest my-map -- --template react-ts
cd my-map
npm install @mapcairn/sdk react react-dom maplibre-gl
```

`@mapcairn/sdk` is the one package most apps need. The interface comes from its root, and the MapLibre adapter that draws the map comes from `@mapcairn/sdk/adapter-maplibre`. An app that never imports that subpath carries no map engine. `maplibre-gl` is a required peer, so a strict package manager wants it listed.

## Write the three files

Replace the template's `index.html` and `src/main.tsx` with these, and add `src/page.css`. The page:

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

The SDK ships no base stylesheet, so `src/page.css` gives the map its height and removes the body margin. Without it the map is zero pixels high and nothing shows:

`src/page.css`:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
}
```

The entry file mounts the map with the SDK's interface around it and builds its services with the MapLibre adapter, which needs the address of the engine's worker file. In a Vite app that is the bundler's own worker URL import:

`src/main.tsx`:

```tsx check
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

## Run it

```bash
npm run dev
```

Open the address Vite prints. You should see a map of Cape Town, in the light or dark basemap that matches your system theme, with a "Search places" box at the top left. You can drag and zoom the map, and use the arrow keys when it has focus. The app adds no zoom buttons or credits of its own; those are slots of `MapChrome` that you fill, as the [example app](https://github.com/MapCairn/mapcairn/blob/main/examples/embed/README.md) does. Search shows sample results, because the services here are the SDK's in-memory fakes. The only requests the page makes are for the basemap, from `https://tiles.openfreemap.org`.

If the page is blank, check that `src/page.css` is imported and that the project has no other style that sets the height of `#root`. [Embed a map](guides/embed-a-map.md) explains each part of `main.tsx` and gives a Content Security Policy to start from.

## Where to go next

- [Embed a map](guides/embed-a-map.md) says what each part does and how another bundler serves the worker file.
- [Extending MapCairn](guides/extending.md) lists what an app provides around the SDK and how to add a basemap, a data layer, a search or routing provider, or an adapter of your own.
- The [API reference](api/index.md) lists every export of the six packages.

## Status

The SDK is pre-1.0. While the version starts with `0.`, a minor release can contain a breaking change to the public API, and a patch release is not meant to. A `^0.1.0` range takes patch releases but not the next minor release.
