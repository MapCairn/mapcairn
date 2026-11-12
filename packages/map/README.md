# `@mapcairn/map`

The map user interface of MapCairn: the chrome around the map, the sheet and its panels, the search, locate, measure, draw and directions tools, the first-visit tour, the accessible primitives and the `MapView` host. It is React with vanilla-extract styles, built on `@mapcairn/core`, `@mapcairn/react` and `@mapcairn/theme`. It has no dependency on `@mapcairn/web`.

It never imports a map engine, an adapter or a browser service. Everything it needs comes from the `Services` bundle that `ServicesProvider` supplies, so the same components run against the real adapters in the host and against fakes in tests. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) and [`DESIGN.md`](../../DESIGN.md).

## Exports

Everything is exported from `@mapcairn/map`.

| Area | Source | What it holds |
|---|---|---|
| Services | `src/services` | `ServicesProvider` and `useServices`, with a typed hook per service: `useSearchProvider`, `useSuggestionProvider`, `useRoutingProvider` and `useFileOpener` (each of these three is undefined when the host has none), `useLocationProvider`, `useClipboard`, `useFileSaver`, `useUrlState`, `useThemeSource`, `usePreferences`, `useSaveData`, `useLayers`, `useBasemaps` (the host's basemap catalogue, or the built-in one), `useMapAdapterFactory`, plus `useSettings` and `useTheme`. Throws outside a provider. |
| Map host | `src/host` | `MapView`, which mounts one adapter from the services in a host element and wires its events, and `useMap` for components below it. It takes an `initialView`, the active `basemap`, event callbacks, overlay `children` and a `chrome` render prop. The overlays (`MapOverlayLayer`, `PinMarker`, `MeasureOverlay`, `AccuracyCircle`, `CentreCrosshair`), `useLongPress` and `usePointerPosition` live here too. |
| Chrome | `src/chrome` | `MapChrome`, which owns the position of every control floating over the map, and its slot contents: `EndStack`, `MapReadout` (scale bar, cursor coordinates and the zoom level as "z 12.4"; the zoom follows the chrome layout, shown in the side panel layout only, unless `showZoom` says otherwise), `Attribution` and `Sheet` (bottom sheet or side panel). Also the layout and focus contexts. |
| Panels | `src/panels` | The sheet content: `SheetContent` (Settings and Help for the `settings` and `help` sections, and the Map options sections otherwise), `BasemapPicker`, `SettingsSection` (its privacy statement is the host's `privacyNote`, passed through `SheetContent`, with a neutral default), `PinSection`, `HelpSection`, `ShapesSection` and `ExportSection`. `LayersSection` is in `src/layers` and renders only when the `LayerRegistry` has layers. |
| Tools | `src/tools` | `SearchPill` with `useSearch` and `useSuggestions` (places as the person types, only when the host supplies a suggestion provider), `useLocate`, `MeasureToolbar` with `useMeasure`, `DrawToolbar` with `useDraw` and `DrawMapBindings`, `DirectionsPanel` with `useDirections`, `MapDirections` and `DirectionsOverlay` (`useDirections` reports `available` only when the host has a routing provider, and a host shows the Directions button, `EndStack`'s `directions` prop, only then), `PinCard` with `useReverseAddress` (the host's `lookupNote` says what the lookup sends and to whom, with a neutral default), and `TourCard` with `useTour`. |
| Primitives | `src/ui` | `Button`, `Chip`, `ControlGroup`, `EmptyState`, `Icon` (the one way to draw a Lucide icon), `IconButton`, `ListRow`, `LiveRegionProvider` with `useAnnounce` (the one announcer), `SegmentedControl`, `SkipLink`, `Slider`, `StatusMessage`, `Surface`, `Switch`, `Tooltip` and `VisuallyHidden`. |

The `MapChrome` slots, the sheet detents and the accessibility contract of each component are in [`DESIGN.md`](../../DESIGN.md).

## Setup

Component styles are written in [vanilla-extract](https://vanilla-extract.style/) (`*.css.ts` beside each component) and read the tokens from `@mapcairn/theme`. This package ships source with no build step, so a host must register `vanillaExtractPlugin()` from `@vanilla-extract/vite-plugin` in its Vite config, or `.css.ts` imports will not resolve.

```ts
// vite.config.ts
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [vanillaExtractPlugin() /* , ...your other plugins */],
});
```

`@mapcairn/theme` carries its own token values, and its stylesheet reaches the page only through an import that is used (see `packages/web/src/global.css.ts`). `MapChrome` fills its container, so the host gives `html`, `body` and the element it renders into a height. The tokens name the IBM Plex Sans Variable font, which the host loads (for example from `@fontsource-variable/ibm-plex-sans`); without it the type falls back to the system font. The host also provides the engine styles for its map adapter; the MapLibre styles are in `packages/web/src/adapters/mapEngine.css.ts`. `examples/embed` is a minimal host that does all of this, described in [`docs/guides/extending.md`](../../docs/guides/extending.md).

## Usage

Build the services once, wrap the tree, then render the map with its chrome. `packages/web/src/App.tsx` and `packages/web/src/app/AppChrome.tsx` are the full reference.

```tsx
import { ServicesProvider, MapView, MapChrome } from "@mapcairn/map";

<ServicesProvider services={services}>
  <MapView
    initialView={initialView}
    basemap={basemap}
    chrome={(map) => <MapChrome background={map} modal={false} />}
  />
</ServicesProvider>;
```

`services` comes from the host's composition root. In tests, use `createFakeServices()` from `@mapcairn/core`. The host also mounts `LiveRegionProvider` (the one announcer) and `TooltipProvider` above the map, as `packages/web/src/root.tsx` does. Without a `LiveRegionProvider`, announcements are dropped, with a warning in development.

## What doesn't belong here

- A map engine, an adapter or a browser API. Those live in `packages/web/src/adapters` behind a port from `@mapcairn/core`.
- App-specific copy, routes and headers. Those belong to the host.
- Raw colours, sizes, z-index values or icon packages. Use the tokens and `Icon`.
