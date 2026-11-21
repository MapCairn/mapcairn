# `@mapcairn/map`

The map user interface of MapCairn, in React: the chrome around the map, the bottom sheet and its panels, the search, locate, measure, draw and directions tools, the first-visit tour, the accessible primitives and the `MapView` host. Use it to put a finished, accessible interface around a MapLibre map without building each control yourself.

Most apps should install [`@mapcairn/sdk`](https://github.com/MapCairn/mapcairn/tree/main/packages/sdk) instead: one install, one import and one stylesheet for the whole SDK, which re-exports this package. Install `@mapcairn/map` on its own as the advanced option, for a host that wants fewer dependencies.

It never imports a map engine, an adapter or a browser service. Everything it needs comes from the `Services` bundle that `ServicesProvider` supplies, so the same components run against real adapters in an app and against fakes in a test. It is built on [`@mapcairn/core`](https://github.com/MapCairn/mapcairn/tree/main/packages/core), [`@mapcairn/react`](https://github.com/MapCairn/mapcairn/tree/main/packages/react) and [`@mapcairn/theme`](https://github.com/MapCairn/mapcairn/tree/main/packages/theme).

**Status:** a release candidate, for early adopters. The API is still settling, so a breaking change can land before `0.1.0`; the [changelog](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md) lists each one. Until `0.1.0`, add `@next` to every package name in the install commands below.

## Install

```bash
npm install @mapcairn/map@next @mapcairn/core@next @mapcairn/theme@next
pnpm add @mapcairn/map@next @mapcairn/core@next @mapcairn/theme@next
yarn add @mapcairn/map@next @mapcairn/core@next @mapcairn/theme@next
```

The examples below import from `@mapcairn/core` and `@mapcairn/theme` too, so install them beside it. React and React DOM 19 are peer dependencies, and your app already has them.

The package is ESM only: it has no `main` field and no CommonJS build. A TypeScript project needs `moduleResolution` set to `node16`, `nodenext` or `bundler`; `node10` is not supported.

## Set up

Import the two stylesheets once, in your entry module. The first holds the design tokens and the second the styles of every component. Both are plain CSS, so an app needs no vanilla-extract plugin.

```tsx
import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
```

The JavaScript imports no CSS, so the components render on the server as plain modules. A few things are yours to provide:

- `MapChrome` fills its container, so give `html`, `body` and the element you render into a height.
- The tokens name the IBM Plex Sans Variable font, which your app loads (for example from `@fontsource-variable/ibm-plex-sans`). Without it the type falls back to the system font.
- The map engine and its styles. The package never imports one; your app supplies a `MapAdapter` over MapLibre GL JS in the `Services` bundle. The MapLibre adapter is [`@mapcairn/adapter-maplibre`](https://github.com/MapCairn/mapcairn/tree/main/packages/adapter-maplibre), which `@mapcairn/sdk` re-exports at `@mapcairn/sdk/adapter-maplibre`.

The styles of the primitives (buttons, chips, surfaces and list rows) sit in a cascade layer, so an unlayered rule in your own CSS, such as `button { background: transparent; border: 0; padding: 0 }` or `:focus-visible { outline: none }`, beats them. Put your app's base styles and resets in an `@layer` that is declared before `@mapcairn/map/styles.css` is imported, and they rank below the primitives. This is a known trade-off for 0.1.0; see [Overriding a primitive](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#overriding-a-primitive).

The generated names of the CSS custom properties in `tokens.css` are private and can change in any release, so do not write your own stylesheet against them. [How the CSS ships](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#how-the-css-ships) says what is and is not settled.

## Usage

Build the services once, wrap the tree, then render the map with its chrome. This is a whole app. It runs on the SDK's in-memory fakes, so it requests nothing and draws no map tiles; a real map swaps in the MapLibre adapter, as the [adapter's README](https://github.com/MapCairn/mapcairn/tree/main/packages/adapter-maplibre) shows.

```tsx
import { createFakeServices } from "@mapcairn/core";
import {
  FocusRegistryProvider,
  LiveRegionProvider,
  MapChrome,
  MapView,
  SearchPill,
  ServicesProvider,
  TooltipProvider,
  useBasemaps,
  useMap,
} from "@mapcairn/map";
import { type ReactNode, useState } from "react";

export function App() {
  const [services] = useState(createFakeServices);
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
  return (
    <MapView
      initialView={{
        center: { lat: -33.92, lng: 18.42 },
        zoom: 11,
        bearing: 0,
      }}
      basemap={basemaps.resolve(basemaps.defaultId)}
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
```

The repository's `examples/embed` is the full version of this app, with the end stack of controls, the sheet, the measure tool, layers and a search provider of its own. A test in the repository fails if this snippet uses an import, a component or a prop that the example does not. `LiveRegionProvider` is the one announcer: without it, announcements are dropped.

## Loading the map in a chunk of its own

`@mapcairn/map` is a whole interface, so an app that imports it in its entry module ships all of it with the first page. The example app on the fakes, which loads no map engine, builds to a single script large enough that Vite warns about its size. If the map is not the first thing a visitor needs, load it on demand. Put the code that imports `@mapcairn/map` in a module of its own (here `App.tsx`, which exports `App`, as above) and load it with a dynamic import:

```tsx
import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";

const App = lazy(() =>
  import("./App").then((module) => ({ default: module.App })),
);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Suspense fallback={null}>
      <App />
    </Suspense>,
  );
}
```

A bundler that splits on dynamic imports, such as Vite, then writes `App.tsx` and everything only it imports, which is the whole interface, to a separate chunk that loads when the app mounts. Put the code that imports your map engine in the same module, so the engine loads with the map. Show something useful in the `Suspense` fallback, such as a placeholder with the page's height.

## What it exports

Everything comes from `@mapcairn/map`. In outline:

- **Services:** `ServicesProvider` and a hook for each service.
- **Map host:** `MapView`, which mounts the adapter and wires its events, and `useMap`.
- **Chrome:** `MapChrome`, which owns the position of every control floating over the map, and the controls that fill its slots.
- **Panels and layers:** the sheet content, the basemap picker, settings, the layers panel, feature cards and `useDataLayers`.
- **Tools:** search, locate, measure, draw and directions, each as a component and a hook.
- **Primitives:** buttons, chips, list rows, sliders, the live region and the other accessible building blocks, with the one `Icon` component.

## Exports in detail

The Source column names folders under `packages/map/src` in the repository.

| Area       | Source         | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Services   | `src/services` | `ServicesProvider` and `useServices`, with a typed hook per service: `useSearchProvider`, `useSuggestionProvider`, `useRoutingProvider`, `useFileOpener`, `useSelectionStore` (the host's store of selected features) and `useFeatureQuery` (the host's query for the features inside a shape; each of these last five is undefined when the host has none), `useLocationProvider`, `useClipboard`, `useFileSaver`, `useUrlState`, `useThemeSource`, `usePreferences`, `useOnline` (whether the browser says the device is online, true where the host gives no signal), `useSaveData`, `useLayers` (the host's layer catalogue, a store `useDataLayers` reads with `useSyncExternalStore`), `useBasemaps` (the host's basemap catalogue, or the built-in one), `useMessages` (the active message catalogue, which follows the language setting when the host offers languages) and `useLanguages` (the host's `LanguageCatalogue`, or undefined), `useMapAdapterFactory`, plus `useSettings` and `useTheme`. Throws outside a provider.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Map host   | `src/host`     | `MapView`, which mounts one adapter from the services in a host element and wires its events, and `useMap` for components below it. It takes an `initialView`, the active `basemap`, event callbacks, overlay `children` and a `chrome` render prop. The overlays (`MapOverlayLayer`, `PinMarker`, `MeasureOverlay`, `AccuracyCircle`, `CentreCrosshair`), `useLongPress` and `usePointerPosition` live here too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Chrome     | `src/chrome`   | `MapChrome`, which owns the position of every control floating over the map, and its slot contents: `EndStack`, `MapReadout` (scale bar, cursor coordinates and the zoom level as "z 12.4"; the zoom follows the chrome layout, shown in the side panel layout only, unless `showZoom` says otherwise; a host that shows the position from `MapView`'s `onPointerMove` passes `onCursorLeave` to clear it, because the map keeps the position while the pointer is over the readout), `Attribution` and `Sheet` (bottom sheet or side panel). `MapChrome` also has a `mapKey` slot above the scale bar for `MapKey` (see Panels); a host that leaves the prop out has no map key. Also the layout and focus contexts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Panels     | `src/panels`   | The sheet content: `SheetContent` (Settings and Help for the `settings` and `help` sections, and the Map options sections otherwise), `BasemapPicker`, `SettingsSection` (with a language switcher when the host offers more than one language; its privacy statement is the host's `privacyNote`, passed through `SheetContent`, with a neutral default), `PinSection`, `HelpSection` (with an optional host About block, the `about` prop also on `SheetContent`), `ShapesSection` (its import offers a native "WKT coordinate order" select, longitude first until changed and kept for the session, backed by `useDraw().wktAxisOrder`, and when a WKT file's first position fits only the other order it imports nothing and offers a button that reads the file the other way through `useDraw().rereadImport`) and `ExportSection`. `LayersSection` is in `src/layers`. It lists the layers of a ready `LayerCatalogue`, and for a catalogue that loads it says so while it loads, when it has failed (with a Try again button that `useDataLayers.retryCatalogue()` backs), when it is empty, and how many definitions were skipped; a refresh that fails keeps the last list. A host whose catalogue was ready with no layers at the start has no Layers section. Its `intro` prop (also on `SheetContent`) replaces the line above the layers, "Open data from public providers", for a host whose layers are not public. It offers "Turn off all layers", a "Turn off N in `<group name>`" action for each group and an Undo below either (`useDataLayers` has `turnOff`, `turnedOff` and `undoTurnOff`); a host that does not want them passes `showTurnOffAll={false}` to `LayersSection` or `SheetContent`. `LayerKey` draws one layer's key and is used by the Layers section and by `MapKey`, which shows the key of every layer that is on, over the map, with a button that minimises it to a chip (a phone in either orientation starts it minimised, a larger screen starts it open, or `defaultMinimised` says; that is decided when it first appears, and the choice is held in memory only). `mapKeyBlocks` returns the same blocks as data.                                                                     |
| Layers     | `src/layers`   | `useDataLayers` (the data layers' state and every action on them), `MapDataLayers` (draws them through the adapter), `FeatureCard`, `LayersSection` and `SelectionMarker` (the ring round the feature whose card is open). `useDataLayers.identifyAt(target, { focus })` asks the tile layers that have an `identify` block what is at a place, at most `MAX_IDENTIFY_LAYERS` (4) layers with `IDENTIFY_TIMEOUT_MS` (8 seconds) each, opens what they find as a card or a list and says one message (sent with the announcer's `keep` option, because it reports the outcome of the person's tap); it resolves with `{ asked, found }`, or null when it was cancelled. `cancelIdentify()` ends one in flight and returns whether there was one, and `identifying` is true while one waits. `select` and `choose` cancel it when they open a card or a list, and `MapDataLayers` cancels it when `ignoreTaps` turns true; a host calls `identifyAt` from its map click and its `I` key, and `cancelIdentify` when the open surface changes, on a long press and on Escape (`packages/web/src/app/useMapApp.ts` is the reference). `LayersSection` says an identifiable layer can be tapped, and `useIdentifyFeedback(layers.identifying)` with `<IdentifyStatus onCancel={layers.cancelIdentify} />` give a host the "Looking up what is here" line to show in its bottom-centre slot after `IDENTIFY_FEEDBACK_MS` (400 ms; it is a `StatusMessage`, so it says itself once, and the result is said separately when it arrives). No layer of the reference site defines `identify`, so it asks nothing there. `useFeatureSelection(layers, { formatters })` holds the host's store of selected features for the ui, and returns null when the host supplies no store (`formatters` are the ones card templates may name, for the titles in its messages); call it once beside `useDataLayers` and pass the result to `SelectionProvider`, and components read it with `useSelection()`. The reference host and the example app call the hook and mount the provider; no component reads `useSelection()` yet. Layer card and list templates, feed-shape labels and units can use host translations through the active message catalogue. |
| Tools      | `src/tools`    | `SearchPill` with `useSearch` and `useSuggestions` (places as the person types, only when the host supplies a suggestion provider), `useLocate`, `MeasureToolbar` with `useMeasure`, `DrawToolbar` with `useDraw` and `DrawMapBindings`, `DirectionsPanel` with `useDirections`, `MapDirections` and `DirectionsOverlay` (`useDirections` reports `available` only when the host has a routing provider, and a host shows the Directions button, `EndStack`'s `directions` prop, only then), `PinCard` with `useReverseAddress` (the host's `lookupNote` says what the lookup sends and to whom, with a neutral default), and `TourCard` with `useTour`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Primitives | `src/ui`       | `Button`, `Chip`, `ControlGroup`, `EmptyState`, `Icon` (the one way to draw a Lucide icon, with `mirrorInRtl` for one that points along the reading direction), `IconButton`, `ListRow`, `LiveRegionProvider` with `useAnnounce` (the one announcer), `SegmentedControl`, `SkipLink`, `Slider`, `StatusMessage` with `StatusMessageFocusProvider` (where focus goes when a message goes away and its origin cannot take it; `MapView` supplies the map region), `Surface`, `Switch`, `Tooltip` and `VisuallyHidden`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

The `MapChrome` slots, the sheet detents and the accessibility contract of each component are in [`DESIGN.md`](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md). For how map fits with the other packages, read [`ARCHITECTURE.md`](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md).

## Licence

`@mapcairn/map` is licensed under AGPL-3.0-only, an open-source licence that allows commercial use, and the [licence text](https://github.com/MapCairn/mapcairn/blob/main/packages/map/LICENSE) comes with the package. If you distribute an app that includes the SDK, including by serving it to people's browsers, you must offer them the corresponding source of the whole app under the same licence. If you modify the SDK and let people interact with your modified version over a network, you must offer them its corresponding source. A licence for closed-source use is not on offer yet. [What the licence means for your project](https://github.com/MapCairn/mapcairn/blob/main/docs/guides/licence.md) says it in plain words and is not legal advice. The SDK packages depend only on permissively licensed packages. The [licence section of the repository README](https://github.com/MapCairn/mapcairn#licence) says more, including how to discuss other terms for closed-source use.

## Contributing and changes

The source and the issue tracker are in the [repository](https://github.com/MapCairn/mapcairn); file a bug in the [issue tracker](https://github.com/MapCairn/mapcairn/issues). Ask a question in [Discussions](https://github.com/MapCairn/mapcairn/discussions). Report a security problem privately, as [`SECURITY.md`](https://github.com/MapCairn/mapcairn/blob/main/SECURITY.md) explains, not in an issue. Read [`CONTRIBUTING.md`](https://github.com/MapCairn/mapcairn/blob/main/CONTRIBUTING.md) before you send a pull request. Changes between releases are listed in [`CHANGELOG.md`](https://github.com/MapCairn/mapcairn/blob/main/CHANGELOG.md).
