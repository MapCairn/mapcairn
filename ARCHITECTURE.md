# Architecture

Karta separates what the app does from what it runs on. The interface and the pure logic depend on small interfaces (ports). Concrete code that touches a map engine, a browser API or a network service (adapters) lives in one place each and is wired together once, in the composition root.

```mermaid
flowchart TD
  subgraph web["packages/web"]
    root["composition root<br/>createServices()"]
    adapters["adapters<br/>maplibre, search,<br/>location, settings, clipboard,<br/>url, theme"]
    host["SSR host, routes, engine CSS"]
  end
  subgraph map["packages/map"]
    ui["ui: components, MapChrome,<br/>ServicesProvider, hooks"]
  end
  subgraph core["packages/core"]
    ports["ports (types only)"]
    logic["pure logic<br/>state machines, maths,<br/>formatters, announcements"]
    fakes["fakes and contract suites"]
  end
  theme["packages/theme<br/>tokens, contrast maths"]
  react["packages/react<br/>generic hooks"]
  root --> adapters
  root --> ui
  adapters --> ports
  adapters --> logic
  ui --> ports
  ui --> logic
  ui --> theme
  ui --> react
  ports --> logic
  fakes --> ports
```

## Layers and dependency rules

| Layer | Lives in | May import | Must not |
| --- | --- | --- | --- |
| core | `packages/core/src` | itself and npm maths libraries | touch DOM, React, a map engine, a browser global or the clock |
| ports | `packages/core/src/ports` | types from core | contain an implementation (apart from small typed error classes) |
| fakes | `packages/core/src/fakes` | ports, core | read browser globals |
| ui | `packages/map/src` | core, ports, theme, react | import an adapter, an engine or a browser service |
| adapters | `packages/web/src/adapters` | ports, core | be imported by anything except the composition root |
| composition root | `packages/web/src/composition` | everything | be imported as a singleton; it exposes `createServices()` only |

`npm run lint` enforces these rules with dependency-cruiser (layers, engine imports), Biome (restricted imports and globals, accessibility rules) and the harmony scanner in `scripts/harmony` (style, markup and wiring rules), whose rules are proven by Vitest tests in `packages/core/src/lint`. A violation fails the build.

## Ports

Add an interface only where a boundary has at least two implementations. The fake counts as the second implementation. Each port has a real adapter, a fake and a shared contract suite that runs against both.

`MapAdapter` has one real implementation, MapLibre GL JS, and is kept for two reasons. It is the boundary between the ui and the engine, so the ui never imports `maplibre-gl`. It also lets unit tests run the ui against an in-memory fake, with no WebGL. The contract suite runs against both the fake and the MapLibre adapter, so the fake cannot drift from the real behaviour.

| Port | Real adapter | Fake |
| --- | --- | --- |
| `MapAdapter` | MapLibre GL JS (vector and raster styles) | scripted in-memory map |
| `SearchProvider` | Nominatim | scripted results and errors |
| `LocationProvider` | browser geolocation | scripted fixes and errors |
| `SettingsStore` | `localStorage` with in-memory fallback | in-memory |
| `ClipboardPort` | `navigator.clipboard` with a legacy fallback | recording fake |
| `UrlState` | location hash and `history.replaceState` | in-memory |
| `ThemeSource` | `matchMedia` | scripted system preference |
| `LayerRegistry` | empty registry for now | list of sample layers |

`BasemapDefinition` is a typed data module, not a port. It is the only place that names a tile source or an attribution string. A `raster` source is a tile URL template and a tile size, and a `vector` source is a style URL.

Pure helpers (zoom conversion, metres per pixel, the surface state machine, sheet snapping, coordinate formatting, announcement text, theme resolution, hash parsing) are plain functions in core. They are not wrapped in interfaces.

## The map adapter

MapLibre GL JS is the only map engine, and the ui never imports it. `MapView` takes an adapter factory (`() => MapAdapter`) from the services, mounts one adapter in a host element and wires events to the rest of the ui. Changing basemap calls `setBasemap` on that adapter. The adapter builds an inline raster style for a `raster` source and loads the style URL for a `vector` source.

- **Zoom** is normalised to the 256 px tile convention (OpenStreetMap tile numbering). MapLibre counts 512 px tiles, so the engine zoom is the normalised zoom minus one. That offset is one constant, converted only inside the adapter. For the 256 px raster style, the tile level equals the normalised zoom. The URL, the saved view, the scale bar and the tests use the normalised value only.
- **Overlays** (pin, measure line, accuracy circle) are drawn once, in a single overlay layer positioned with `adapter.project`.
- **Engine CSS** lives in one file, `packages/web/src/adapters/mapEngine.css.ts`. It styles MapLibre only, scopes its rules under the host's `data-map-host` attribute, hides MapLibre's own controls, replaces fonts and focus rings, and sets the map background from the tokens.
- **Loading** is lazy. The MapLibre module imports `maplibre-gl` dynamically the first time the map mounts.
- **No WebGL** means no map. There is no fallback basemap. The app shows a plain message in place of the map ("Karta needs WebGL to draw the map.") with advice to try a different browser or turn on hardware acceleration. `MapUnavailable` draws it inside the map region, so the region and the skip link still work, and announces it once, assertively, through the shared announcer rather than being a live region itself. It has no Retry, because mounting again would fail the same way.

## Adding an adapter

1. Define or extend the port in `packages/core/src/ports`, with typed errors and an `AbortSignal` on async calls.
2. Write the fake in `packages/core/src/fakes` and the contract suite in `packages/core/src/contracts`.
3. Write the real adapter in `packages/web/src/adapters`, passing the same suite.
4. Register it in `createServices()`.
5. Read it in the ui through a typed hook (`useSettings`, `useSearch` and so on).

## How tests substitute services

Unit tests wrap components in `ServicesProvider` with fakes. In non-production builds, `createServices()` accepts overrides from `window.__KARTA_TEST_SERVICES__`, set with Playwright `addInitScript`, so end-to-end tests script geolocation, search, clipboard, storage and the system theme. The seam is compiled out of production builds, and a test searches the build output to prove it.
