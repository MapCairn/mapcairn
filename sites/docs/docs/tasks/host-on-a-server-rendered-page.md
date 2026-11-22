---

title: Host the map on a server-rendered page
sidebar_label: Host on a server-rendered page
description: Render the page on the server with a placeholder where the map goes, then draw the map in the browser after hydration.
---

# Host the map on a server-rendered page

This page is for a developer whose pages are rendered on a server (a React framework, or your own `renderToString` code) and who wants a map on one of them. By the end the server will send the page with a placeholder where the map goes, with no browser-only code run on the server, and the browser will replace the placeholder with the map once the page has hydrated.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The code uses [`ServicesProvider`](../api/map/ServicesProvider.md), [`MapView`](../api/map/MapView.md), [`ChromeSkeleton`](../api/map/ChromeSkeleton.md), [`chromeSkeletonCopy`](../api/map/chromeSkeletonCopy-function.md) and [`useMessages`](../api/map/useMessages.md).

## What runs where

The SDK server-renders its chrome, but not the map. The map engine needs a canvas and the browser's graphics, and the map depends on the person's stored settings and device preferences, which a server cannot know. The reference site follows the same rule: its server sends a placeholder with a stand-in for the controls, and the map mounts after hydration.

- The packages import on a server without a browser. The root of `@mapcairn/sdk` carries no map engine, and the MapLibre adapter loads `maplibre-gl` only when a map mounts, so importing the adapter in server code starts no engine.
- `ChromeSkeleton` is the server-rendered stand-in for the map's controls: the search box, the buttons and the credits button, in the places the live chrome uses, so nothing moves when the map takes over. It is decorative, so it is hidden from assistive technology and cannot take focus, and it sets no `style` attribute, so a strict Content Security Policy accepts it.
- The map, with its chrome, mounts in the browser after hydration. Until then the server's markup stays, so the first paint does not wait for the engine.

## Render the placeholder, then the map

`ClientOnly` renders its `fallback` on the server and while the page hydrates, and its children on the render after that, so the server's markup and the first client render agree and React reports no mismatch. `useSyncExternalStore` gives it that behaviour with no effect and no state:

```tsx check
/// <reference types="vite/client" />
import {
  ChromeSkeleton,
  chromeSkeletonCopy,
  createFakeServices,
  defaultBasemapFor,
  LiveRegionProvider,
  MapView,
  type Services,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMessages,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import { type ReactNode, useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => undefined;
}

function ClientOnly({
  fallback,
  children,
}: {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? children : fallback;
}

/** Build the services once for each app instance, never at module scope. */
export function createServices(): Services {
  return createFakeServices({
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
}

function MapPlaceholder() {
  const messages = useMessages();
  return (
    <div aria-busy="true">
      <ChromeSkeleton copy={chromeSkeletonCopy(messages)} />
    </div>
  );
}

function MapScreen() {
  const basemaps = useBasemaps();
  const { resolved } = useTheme();
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 }}
      basemap={defaultBasemapFor(basemaps, resolved)}
    />
  );
}

export function App({ services }: { readonly services: Services }) {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <TooltipProvider>
          <ClientOnly fallback={<MapPlaceholder />}>
            <MapScreen />
          </ClientOnly>
        </TooltipProvider>
      </LiveRegionProvider>
    </ServicesProvider>
  );
}
```

Give the placeholder's container the map's height in your own stylesheet, as in Get started, so the page does not jump when the map arrives. The `aria-busy` attribute tells assistive technology that the region is still loading.

## Render on the server and hydrate in the browser

These two helpers are all a framework does for you. On the server, render the app to a string and put it in the page, with `lang` and `dir` set for the language you serve and the SDK's stylesheet linked. In the browser, hydrate the same app onto the same element:

```tsx check
import type { ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

/** The whole page for a request: the rendered app inside the shell. */
export function renderPage(app: ReactElement): string {
  return `<!doctype html>
<html lang="en-GB" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    <div id="root">${renderToString(app)}</div>
    <script type="module" src="/assets/client.js"></script>
  </body>
</html>`;
}

/** Called by the browser entry, with the same app the server rendered. */
export function hydrate(app: ReactElement): void {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("The page has no #root element.");
  }
  hydrateRoot(root, app);
}
```

Build the services separately for each request on the server, and once in the browser, so one visitor's state never reaches another's. Your build must put `@mapcairn/sdk/styles.css` into `/assets/app.css`, and serve the engine's worker file from your own origin, as in Get started.

## Things to check

- **Language and direction.** Set `<html lang>` and `<html dir>` on the server for the language you serve, and keep them in step on the client. [Translate the interface](translate-the-interface.md) covers the rest.
- **Theme.** The server cannot know the person's choice, so a page can flash the other theme before the browser applies it. Set `data-theme` before the first paint with a small script in the head. [Content Security Policy](../guides/content-security-policy.md) says how a strict policy allows that script, and why a server that streams needs a nonce for the scripts React adds.
- **Content Security Policy.** The adapter's worker needs `worker-src`, and the basemap needs `connect-src` and `img-src` for its origin. The same guide has a policy to start from.
- **No map on the server.** Search engines and readers that do not run script see the placeholder only, so put the page's own text, such as what the map shows and where, in the server-rendered HTML around it.

## What is not covered

Rendering the map itself on the server, or producing a map image where no one is looking at the map, is not offered; the [capability matrix](../guides/capability-matrix.md) lists it as missing. There is no prebuilt script with a mount function for pages without React either, so a host that does not use React needs a small React island of its own.
