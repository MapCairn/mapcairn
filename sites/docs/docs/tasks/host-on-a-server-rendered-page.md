---

title: Host the map on a server-rendered page
sidebar_label: Host on a server-rendered page
description: Render the page on the server with a placeholder where the map goes, then draw the map in the browser after hydration.
---

# Host the map on a server-rendered page

Put the map on a page that a server renders, whether with a React framework or your own `renderToString` code: the server sends a placeholder where the map goes, runs no browser-only code, and the browser swaps in the map once the page has hydrated.

The code uses [`ServicesProvider`](../api/map/ServicesProvider.md), [`MapView`](../api/map/MapView.md), [`ChromeSkeleton`](../api/map/ChromeSkeleton.md), [`chromeSkeletonCopy`](../api/map/chromeSkeletonCopy-function.md) and [`useMessages`](../api/map/useMessages.md).

## What runs where

The SDK server-renders its chrome, but not the map. The map engine needs a canvas and the browser's graphics, and the map depends on the person's stored settings and device preferences, which a server cannot know. The reference site follows the same rule: its server sends a placeholder with a stand-in for the controls, and the map mounts after hydration.

- The packages import on a server without a browser. The root of `@mapcairn/sdk` carries no map engine, and the MapLibre adapter loads `maplibre-gl` only when a map mounts, so importing the adapter in server code starts no engine.
- `ChromeSkeleton` is the server-rendered stand-in for the map's controls: the search box, the buttons and the credits button, in the places the live chrome uses, so nothing moves when the map takes over. It is decorative, so it is hidden from assistive technology and cannot take focus, and it sets no `style` attribute, so a strict Content Security Policy accepts it.
- The map, with its chrome, mounts in the browser after hydration. Until then the server's markup stays, so the first paint does not wait for the engine.
- In releases after `0.2.0`, a `MapView` mounted in the browser fetches part of its interface apart and renders nothing until that part has arrived: neither its `chrome` nor its children are mounted before then. This is not in `0.2.0` or any earlier release, where `MapView` renders the empty map region at once. The example below swaps the placeholder for `MapView` after hydration, so on a slow connection the space stays empty for a moment. To keep the placeholder until the map draws, render it beside `MapView` and remove it from a layout effect in a child of `MapView`, which mounts only then, and from `onEngineError`.
- In releases after `0.2.0`, a server's markup holds nothing for a `SegmentedControl`, in a `MapView` or out of one: it appears in the browser once the part fetched apart has arrived. This is not in `0.2.0` or any earlier release.

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

Rendering the map itself on the server, or producing a map image where no one is looking at the map, is not offered; the [capability matrix](../guides/capability-matrix.md) lists it as missing. This page is for React. A page without React can use `@mapcairn/sdk/browser`, which is not in `0.2.0` or any earlier release: [A map on a server-rendered page, without React](../guides/browser-route.md).

## When it goes wrong

- **The map cannot start after hydration.** The placeholder is replaced by `MapView`, so if the engine then fails (no WebGL 2, a worker the policy blocks) the map region stays empty. `MapView` marks it `data-state="error"`, `useMap().error` holds the `MapEngineError`, and `onEngineError` is called. The chrome still shows, so tell the person: the English catalogue has "The map could not start. Reload the page to try again." as `app.banner.engineFailed`. [Troubleshooting](../troubleshooting.md#the-map-does-not-start) lists each message and fix.
- **Part of the interface cannot be fetched.** In releases after `0.2.0`, if the part `MapView` fetches apart fails, or has not arrived after 30 seconds, `MapView` draws "The map could not start. Reload the page to try again." in a region named as the map is, announces it, calls `onEngineError` once with a `load-failed` error and never starts the engine. No chrome is drawn. This is not in `0.2.0` or any earlier release.
- **The page's script never runs.** The server's placeholder stays, with `aria-busy="true"`. Put a `<noscript>` note beside it that says the map needs script.
- **A hydration mismatch.** React reports it in the console when the server's markup and the first client render differ. Keep browser-only code, such as stored settings or `window`, inside what `ClientOnly` renders after hydration.

## Related

- [Content Security Policy](../guides/content-security-policy.md) has the policy and the nonce a streaming server needs.
- [Troubleshooting](../troubleshooting.md) covers a blank map and the engine's messages.
- [Translate the interface](translate-the-interface.md) sets the language and direction the server renders.
