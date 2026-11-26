---

title: Build a map without React
sidebar_label: Without React
description: Draw a map with only @mapcairn/core and @mapcairn/adapter-maplibre in plain TypeScript, and what an interface of your own has to do.
---

# Build a map without React

`@mapcairn/core` and `@mapcairn/adapter-maplibre` hold the map port, the logic around it and the MapLibre adapter that fills it, with no interface. An app that brings its own interface, on any framework or none, can use only those two. This page builds one in plain TypeScript with Vite, and lists what your own interface has to do, because the SDK's interface does none of it for you on this route.

The files are in [`examples/headless`](https://github.com/MapCairn/mapcairn/tree/main/examples/headless). The release's consumer check installs the two packages from the packed files into an empty app, builds that example, and fails if the install holds React, `@mapcairn/map`, `@mapcairn/react` or `@mapcairn/sdk`. The code on this page is copied from the example, and a documentation test fails when a block stops matching its file.

## What the two packages hold

- `@mapcairn/core` has the `MapAdapter` port (mount, view, basemap, data layers, events), the basemap definitions and their credits, `MapEngineError`, an in-memory fake of the port, and the rest of the ports and pure logic. It imports no React, no map engine and no browser global.
- `@mapcairn/adapter-maplibre` has `createMapLibreMapAdapter`, which returns a `MapAdapter` that draws with MapLibre GL JS. It adds no controls, markers, popups or credits, and it leaves the engine's own keyboard handling off.

What you leave out is `@mapcairn/map` (the chrome, sheet, search box and tools), `@mapcairn/react` (the hooks) and the umbrella `@mapcairn/sdk`. The port for search, routing and the other services is in `core` too, but the SDK ships no adapter for them: you write one, or leave the feature out.

## Install

```bash
npm install @mapcairn/core @mapcairn/adapter-maplibre maplibre-gl
```

- The adapter pins `@mapcairn/core` to its own version, so install both at the same version.
- `maplibre-gl` is a required peer of the adapter, with the range its `package.json` gives. npm installs it for you, and a strict package manager wants it listed.
- The packages are ESM only, and a TypeScript project needs `moduleResolution` set to `bundler`, `node16` or `nodenext`.
- The declarations of `core` use the global types `Blob` and `AbortSignal`, so the project's `lib` includes `DOM`, as the example's `tsconfig.json` does, or the project has `@types/node`. A project with neither fails with `Cannot find name 'Blob'` from `node_modules/@mapcairn/core`.
- The first line of `main.ts`, `/// <reference types="vite/client" />`, gives TypeScript the types of the `?worker&url` import and of a plain CSS import. A Vite project made from a template already lists `vite/client` in its `tsconfig`, so the line only matters when your project does not already.

## The page

The page holds the map region and the three things around it that the example reports to: a basemap choice, a status line and the credits.

`index.html`:

```html no-check whole source="examples/headless/index.html"
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MapCairn without React</title>
  </head>
  <body>
    <header>
      <h1>MapCairn without React</h1>
      <label>
        Basemap
        <select id="basemap"></select>
      </label>
    </header>
    <section
      id="map"
      aria-label="Map"
      aria-describedby="keys"
      aria-busy="true"
    ></section>
    <p id="keys">Arrow keys move the map. Plus and minus zoom it. Enter names the places at its centre.</p>
    <output id="status"></output>
    <p id="credits"></p>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

The adapter loads the engine's stylesheet itself, when the first map mounts, and the SDK's own stylesheets are not needed. The page gives the map a height, because a map in a container of no height shows nothing:

`src/page.css`:

```css no-check whole source="examples/headless/src/page.css"
html,
body {
  margin: 0;
}

body {
  display: grid;
  grid-template-rows: auto 1fr auto auto auto;
  min-height: 100vh;
  font-family: system-ui, sans-serif;
}

header,
p,
output {
  margin: 0;
  padding: 0.5rem 1rem;
}

#map {
  min-height: 20rem;
}
```

## Create the adapter and the map

`src/main.ts` finds the elements, gives the adapter the URL of the engine's worker and starts the map:

```ts no-check whole source="examples/headless/src/main.ts"
/// <reference types="vite/client" />
import "./page.css";
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";
import {
  BASEMAPS,
  type BasemapAttributionEntry,
  MapEngineError,
} from "@mapcairn/core";
import { type Page, START_BASEMAP_ID, showMap } from "./headlessMap";

function required<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`The page has no #${id} element of the expected kind.`);
  }
  return element;
}

const host = required("map", HTMLElement);
const select = required("basemap", HTMLSelectElement);
const status = required("status", HTMLOutputElement);
const credits = required("credits", HTMLParagraphElement);

// The map region is the one keyboard stop, and this page gives it the arrow and zoom keys.
host.tabIndex = 0;

function creditNode(entry: BasemapAttributionEntry): Node {
  if (!entry.href) {
    return document.createTextNode(entry.text);
  }
  const link = document.createElement("a");
  link.href = entry.href;
  link.textContent = entry.text;
  return link;
}

const page: Page = {
  setStatus: (text) => {
    status.textContent = text;
  },
  setBusy: (busy) => {
    host.setAttribute("aria-busy", String(busy));
  },
  setCredits: (entries) => {
    credits.replaceChildren(
      ...entries.flatMap((entry) => [creditNode(entry), " "]),
    );
  },
};

for (const basemap of BASEMAPS) {
  select.append(new Option(basemap.id, basemap.id));
}
select.value = START_BASEMAP_ID;

/** The worker file, from Vite's own worker URL import, on the page's origin. */
async function loadWorkerUrl(): Promise<string> {
  const worker = await import(
    "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
  );
  return worker.default;
}

/** The page has already told the person why the engine could not start, so that error ends here. */
function engineFailure(error: unknown): undefined {
  if (error instanceof MapEngineError) {
    return undefined;
  }
  throw error;
}

// biome-ignore lint/style/noRestrictedGlobals: this page has no DevicePreferences adapter, so it asks the browser directly.
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");

const map = await showMap({
  adapter: createMapLibreMapAdapter({ loadWorkerUrl }),
  host,
  page,
  reducedMotion: motionQuery.matches,
}).catch(engineFailure);

if (map) {
  select.addEventListener("change", () => {
    void map.switchBasemap(select.value);
  });
  host.addEventListener("keydown", (event) => {
    if (map.handleKey(event)) {
      event.preventDefault();
    }
  });
  motionQuery.addEventListener("change", (event) => {
    map.setReducedMotion(event.matches);
  });
  addEventListener("pagehide", (event) => {
    // A page the browser keeps for the back button (persisted) comes back as it was.
    if (!event.persisted) {
      map.destroy();
    }
  });
}
```

`loadWorkerUrl` resolves to the engine's worker file as your app serves it. MapLibre 6 runs a module worker, and inside a bundle it looks for the file beside the wrong module, so without this URL the map stays blank. In Vite the URL is the bundler's own worker import, as above. With another bundler, serve `maplibre-gl/dist/maplibre-gl-worker.mjs` as a same-origin file and resolve to its address. The adapter makes no request until `mount` runs.

The work with the map is in `src/headlessMap.ts`, which takes the adapter and a small `Page` interface instead of touching the document. That is what lets its test run against `FakeMapAdapter` from `core`, with no browser.

### Mount it and draw a data layer

```ts no-check source="examples/headless/src/headlessMap.ts"
/**
 * Mounts the map in `host`, draws the places over the basemap and keeps the
 * page told about the view, the selection and the map's busy state.
 *
 * @throws The adapter's `MapEngineError` when the engine cannot start. The
 *   page has been told, and the adapter is destroyed.
 */
export async function showMap({
  adapter,
  host,
  page,
  reducedMotion,
}: ShowMapOptions): Promise<HeadlessMap> {
  const stopListening = listen(adapter, page);
  const basemap = basemapNamed(START_BASEMAP_ID);
  try {
    await adapter.mount(host, { view: START_VIEW, basemap, reducedMotion });
  } catch (error) {
    stopListening();
    adapter.destroy();
    page.setBusy(false);
    if (error instanceof MapEngineError) {
      page.setStatus(`The map could not start: ${error.reason}.`);
    }
    throw error;
  }
  adapter.setFeatureLayer(PLACES_LAYER_ID, placeFeatures());
  page.setCredits(buildAttribution(basemap));
  let latestSwap = 0;
  return {
    async switchBasemap(id) {
      const next = basemapNamed(id);
      latestSwap += 1;
      const thisSwap = latestSwap;
      try {
        await adapter.setBasemap(next);
      } catch (error) {
        if (!(error instanceof MapEngineError)) {
          throw error;
        }
        if (thisSwap === latestSwap) {
          page.setStatus(`The ${next.id} basemap could not load.`);
        }
        return;
      }
      if (thisSwap === latestSwap) {
        page.setCredits(buildAttribution(next));
      }
    },
    handleKey(press) {
      if (press.ctrlKey || press.metaKey || press.altKey) {
        return false;
      }
      return (
        pan(adapter, press.key) ||
        zoom(adapter, press.key) ||
        nameCentre(adapter, page, press.key)
      );
    },
    setReducedMotion(reduced) {
      adapter.setAnimationEnabled(!reduced);
    },
    destroy() {
      stopListening();
      adapter.destroy();
    },
  };
}
```

`mount` takes the host element, the view, the basemap and `reducedMotion`. It rejects with a `MapEngineError` when the engine cannot start, with the reason in `reason`, such as `webgl-unavailable`. The example subscribes first, so it misses no event, and takes everything down if the mount fails.

A data layer is a call on the adapter. The example draws three invented points with `setFeatureLayer`. The adapter keeps data layers through a basemap swap, so the example sets the layer once:

```ts no-check source="examples/headless/src/headlessMap.ts"
/** The points of the data layer, with their look already worked out. */
export function placeFeatures(): MapFeature[] {
  return PLACES.map((place) => ({
    id: place.id,
    position: { lat: place.lat, lng: place.lng },
    colour: PLACE_COLOUR,
    radius: PLACE_RADIUS,
    shape: "circle",
  }));
}
```

### Listen to the map

```ts no-check source="examples/headless/src/headlessMap.ts"
/** Subscribes to the events the page cares about. Returns one function that unsubscribes from all. */
function listen(adapter: MapAdapter, page: Page): () => void {
  const stops = [
    adapter.on("moveEnd", (view) => page.setStatus(describeView(view))),
    adapter.on("loading", (busy) => page.setBusy(busy)),
    adapter.on("featureTap", ({ featureId }) => {
      const place = PLACES.find((each) => each.id === featureId);
      if (place) {
        page.setStatus(`Selected ${place.name}.`);
      }
    }),
    adapter.on("basemapUnavailable", (basemap) =>
      page.setStatus(`The ${basemap.id} basemap did not load. Try another.`),
    ),
    adapter.on("fatalError", () =>
      page.setStatus("The map stopped working. Reload the page."),
    ),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}
```

`on` returns a function that unsubscribes. The events that matter here:

- `moveEnd` carries the view once it stops changing. `move` fires continuously while it changes.
- `featureTap` carries the topmost feature of a data layer under a tap, with every feature found there. A plain `click` fires after it for the same tap, with the position.
- `loading` is true while the basemap's style or tiles are loading, so it drives the busy state. A data layer's tiles do not count.
- `basemapUnavailable` says every tile of the basemap failed, so its provider is down or unreachable, and `fatalError` says the engine stopped after it had loaded.

### Move the map from the keyboard

The adapter leaves the engine's keyboard handling off and hides the engine's canvas from assistive technology, so the element you mount into is the one focus stop and the keys are yours. The page makes the region focusable in `main.ts`, and these two functions turn keys into calls. `handleKey` in `showMap` calls them, and does nothing, and returns false, when ctrl, meta or alt is held, so the browser's own shortcuts (back, zoom, find) keep working; `main.ts` calls `preventDefault` only for a key it handled:

```ts no-check source="examples/headless/src/headlessMap.ts"
const PAN_BY_KEY: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -KEY_PAN_PIXELS],
  ArrowDown: [0, KEY_PAN_PIXELS],
  ArrowLeft: [-KEY_PAN_PIXELS, 0],
  ArrowRight: [KEY_PAN_PIXELS, 0],
};

function pan(adapter: MapAdapter, key: string): boolean {
  const step = PAN_BY_KEY[key];
  if (!step) {
    return false;
  }
  adapter.panBy(step[0], step[1]);
  return true;
}
```

```ts no-check source="examples/headless/src/headlessMap.ts"
function zoom(adapter: MapAdapter, key: string): boolean {
  if (key === "+" || key === "=") {
    adapter.zoomIn();
    return true;
  }
  if (key === "-") {
    adapter.zoomOut();
    return true;
  }
  return false;
}
```

Enter is the keyboard route to a feature. The engine's `featuresAt(point)` lists the tappable features at a pixel, so Enter asks for those at the centre of the map and says their names in the status line:

```ts no-check source="examples/headless/src/headlessMap.ts"
/** On Enter, says which places are at the centre of the map: the keyboard route to a feature. */
function nameCentre(adapter: MapAdapter, page: Page, key: string): boolean {
  if (key !== "Enter") {
    return false;
  }
  const names = adapter
    .featuresAt(adapter.project(adapter.getView().center))
    .map(
      ({ featureId }) => PLACES.find((place) => place.id === featureId)?.name,
    )
    .filter((name) => name !== undefined);
  page.setStatus(
    names.length === 0
      ? "No place at the centre of the map."
      : `At the centre of the map: ${names.join(", ")}.`,
  );
  return true;
}
```

Pointer and touch gestures need nothing: the engine handles them.

### Take the map down

`destroy()` on the adapter removes the engine and its listeners. The example also unsubscribes its own handlers first, and `main.ts` calls it when the page is unloaded, but not when the browser keeps the page for the back button.

## What your interface has to do

None of this is done for you when you leave the SDK's interface out.

| What the interface does         | What it needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Size and focus                  | Give the map region a height. Make it focusable, name it, and handle keys, as above, leaving keys with ctrl, meta or alt held to the browser. Give it `aria-describedby` for a line that says which keys work.                                                                                                                                                                                                                                                                                                                                         |
| A keyboard route to features    | A tap on a feature has no keyboard equivalent in the adapter. Give one, as the example does with Enter and `featuresAt`, or a list of the features the person can choose from.                                                                                                                                                                                                                                                                                                                                                                         |
| Say what happens                | Report the view, a selection, a busy map and a failure in text a screen reader reads. The example writes to one `output` element, which a screen reader announces as a status; `aria-busy` on the region follows `loading`.                                                                                                                                                                                                                                                                                                                            |
| Show the credits                | The adapter draws none. `buildAttribution(basemap)` returns the basemap provider's credits followed by MapLibre's, each with a text and, usually, an address. Show them where the map is, and show the new ones after a basemap swap, because a provider's terms ask for them.                                                                                                                                                                                                                                                                         |
| Respect reduced motion          | Pass `reducedMotion: true` when the person has asked their system for less motion. The example also listens to the media query's `change` event and calls `setAnimationEnabled`, which changes the map's own animation while the page is open. The engine's gesture inertia is fixed when the map is created, so it follows the setting at the time of the mount.                                                                                                                                                                                      |
| Handle failure                  | Handle the rejected `mount` and `setBasemap`, `fatalError` and `basemapUnavailable`, which the example turns into a message.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Write your own text             | The example writes its English in the code. `core` has a message catalogue port, `MessageCatalogue`, for an app that translates. A basemap's `name` is a catalogue key, so the example labels its basemap choice with each basemap's `id`.                                                                                                                                                                                                                                                                                                             |
| Choose the basemap              | The adapter has no default basemap and no origin of its own. The basemap you give it decides which provider the visitor's browser contacts, and the built-in ones are served by public tile providers: OpenFreeMap (`tiles.openfreemap.org`), VersaTiles (`tiles.versatiles.org`) and the OpenStreetMap Foundation (`tile.openstreetmap.org`). The example's basemap picker lists every built-in basemap, so a visitor who chooses one reaches that provider. Choose the basemaps you offer for the terms and privacy you accept, and list only those. |
| Allow the worker under a policy | A page with a Content Security Policy needs `worker-src` for the worker file, and the origin of every basemap you offer in `connect-src` and `img-src`, which for the example's picker is the three above. [Content Security Policy](content-security-policy.md) says what each directive is for.                                                                                                                                                                                                                                                      |

## Test it without a browser

`FakeMapAdapter` fills the same port in memory, and has methods that make events happen: `simulateFeatureTap`, `simulateLoading`, `simulateFatalError` and others. `src/headlessMap.test.ts` in the example runs the code above against it, with no map engine and no DOM.

## Next

- [Embed a map](embed-a-map.md) is the route with the SDK's interface, in React.
- [Extending MapCairn](extending.md) lists what an app provides around the SDK, and how to add a basemap, a data layer or an adapter of your own.
