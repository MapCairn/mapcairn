---

title: Extending MapCairn
sidebar_label: Extend the SDK
description: What an app around the SDK provides, and how to add a basemap, a data layer, a search provider, a routing provider or an adapter of your own.
---

# Extending MapCairn

This page is for a developer who embeds the SDK in an app of their own. By the end you will know what the app provides around the SDK, and how to theme the interface and add a basemap, a data layer of each kind, layers supplied at runtime, a search provider, a routing provider or an adapter. The first working map is in [Get started](../get-started.md).

Related guides: [Content Security Policy](content-security-policy.md) for the policy a host page needs, [Serving MapCairn from IIS](serving-from-iis.md) for a server-rendered page, [Translate the SDK](translate-the-sdk.md) for other languages, and [Add to the reference site](add-to-the-reference-site.md) for changing the reference site in this repository. The architecture is in [ARCHITECTURE.md](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md) and the design rules are in [DESIGN.md](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md).

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository.

## Embed the SDK in an app of your own

An app of your own installs `@mapcairn/sdk`, the one package that holds the whole SDK: it re-exports `@mapcairn/core`, `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme` from its root, the MapLibre adapter at `@mapcairn/sdk/adapter-maplibre`, and has one stylesheet (`import "@mapcairn/sdk/styles.css"`). The individual packages are the advanced option, for a host that wants fewer dependencies or only one piece, such as `@mapcairn/core` for the ports and the pure logic with no React.

What an app of your own provides:

- **The stylesheets**, imported once at the top of its entry file: `import "@mapcairn/sdk/styles.css";`, or with the individual packages `import "@mapcairn/theme/tokens.css";` then `import "@mapcairn/map/styles.css";`. No bundler plugin is needed: any bundler that handles a CSS import works, or the files can be linked from the page. A published package holds `dist` only. The custom property names in `tokens.css` are generated and are not public API, so a plain stylesheet does not name them; to give the SDK your own colours, see [Theme the SDK with your own colours](#theme-the-sdk-with-your-own-colours) (and [How the CSS ships](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#how-the-css-ships)).
- **Its reset styles in a cascade layer declared first.** The primitives' styles sit in a layer of their own, so an unlayered rule in your app (an element rule such as `button { background: transparent; border: 0; padding: 0 }`, or `:focus-visible { outline: none }`) beats them whatever its specificity or position. Declare your reset layer first, for example `@layer reset, base;` at the top of your entry stylesheet, and import `@mapcairn/map/styles.css` after it. This is a known trade-off, decided on 2026-11-20 and revisited if an adopter reports a problem (see [Overriding a primitive](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#overriding-a-primitive)).
- **Its own base styles.** The SDK ships no base stylesheet, so a page sets a height on `html`, `body` and the root element, removes the body margin (the browser's 8px margin shows otherwise) and, if it wants the theme's font, text colour and background colour, sets them itself. Reading them from `tokens` in `@mapcairn/theme` and setting them from JavaScript runs only in the browser, so a server-rendered page shows the browser's default font and colours until then. Whether the SDK should ship a base stylesheet is not decided (see [How the CSS ships](https://github.com/MapCairn/mapcairn/blob/main/DESIGN.md#how-the-css-ships)).
- **The font.** The tokens name IBM Plex Sans Variable, for example from `@fontsource-variable/ibm-plex-sans`. Without it the type falls back to the system font.
- **The providers.** `ServicesProvider`, `LiveRegionProvider` and `TooltipProvider` around `MapView`, and `FocusRegistryProvider` around `MapChrome`. [Embed a map](embed-a-map.md) says what each does.
- **The services.** Fakes are enough to see the interface; a real app writes an adapter for each port it needs. For the map, `@mapcairn/adapter-maplibre` is the adapter, and `@mapcairn/sdk/adapter-maplibre` re-exports it: [Show a real map](#show-a-real-map) says how to use it. `runMapAdapterContract` from `@mapcairn/core/contracts` checks an adapter of your own against the port.
- **Its own wording about a provider.** Settings shows a privacy statement and the pin card says what "Look up address" sends and to whom. Both have neutral defaults that name no provider, and a host replaces them with `privacyNote` on `SheetContent` and `lookupNote` on `PinCard`. The Directions panel's `note` and credits work the same way.

A host with more on the first screen has three more optional pieces:

- `Attribution` takes `aboutLink` (`{ href, label }`, a site path or an http or https address), which adds a link to the host's About page after the credits.
- `Attribution` also takes `introHeld`, which holds the credits' first showing back while the host has another card on the map. The hold ends on the first zoom or map move, or after `ATTRIBUTION_HOLD_MAX_MS`, and opening the credits by hand counts as the first showing.
- `SheetContent` takes `about` (`{ heading, text, link: { href, label }, homeLink?: { href, label } }`) for an About block in Help, for a host that wants to point to its source or licence; without it Help shows none. `link` opens in a new tab and must be an http or https address. `homeLink`, a host's own page about the site, opens in the same tab and may also be a path on the site (`/`).

## Show a real map

[Get started](../get-started.md) has a whole app that draws a map, and [Embed a map](embed-a-map.md) says what each part of it does. In short, for an app that installs `@mapcairn/sdk`:

1. List `react`, `react-dom` and `maplibre-gl` beside the umbrella. `maplibre-gl` is a required peer of the umbrella because the subpath needs it; npm installs peers itself, and strict pnpm and Yarn want them listed.
2. Import `@mapcairn/sdk/styles.css` once. It includes the engine styles, which only style a map that `MapView` hosts.
3. Build the services with `createMapAdapter: () => createMapLibreMapAdapter({ loadWorkerUrl })`, importing the adapter from `@mapcairn/sdk/adapter-maplibre` and everything else from `@mapcairn/sdk`. `createFakeServices({ createMapAdapter })` is the smallest form; every other port stays a fake until you write its adapter.
4. Resolve `loadWorkerUrl` to the engine's worker. MapLibre 6 runs a module worker and, inside a bundle, looks for it beside the wrong file, so the map stays blank without this URL. In Vite the URL is the bundler's worker import, `(await import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url")).default`, which emits a same-origin file and needs no plugin. TypeScript needs the types of that import and of a plain CSS import from `vite/client`: start the entry file with `/// <reference types="vite/client" />`, or list `vite/client` under `types` in `tsconfig.json`, or `tsc --noEmit` reports TS2307 for the worker import and TS2882 for the CSS import. With another bundler, emit that file as a static same-origin asset and return its address.
5. Pass `MapView` a basemap. The adapter makes no request until a map mounts, has no default basemap and no origin of its own, so the basemap you pass decides which provider the visitor's browser contacts.
6. Give the page a height and remove the body margin: a map in a zero-height container shows nothing.
7. A page with a Content Security Policy must allow the worker in `worker-src` (see [Content Security Policy](content-security-policy.md#worker-src)), and a worker served with a long cache lifetime needs a key in its URL when the policy changes. [Embed a map](embed-a-map.md) has a policy line to start from.

### Server and Worker builds that import the adapter

A host that renders on a server, or builds a Worker, and imports `@mapcairn/sdk/adapter-maplibre` from code that build follows may bundle the map engine into the server or Worker build. It runs nothing there, and it is large. Import the subpath only in code that runs in the browser (a client-only module or a dynamic import behind it), and keep the root `@mapcairn/sdk` for the code both sides share: the root never imports the adapter or the engine.

## Theme the SDK with your own colours

`createThemeStylesheet` in `@mapcairn/theme` makes the stylesheet that gives the SDK's interface your own colours, and refuses a theme that is below WCAG 2.2 AA. It covers the 14 interface colour roles (`surface`, `surfaceRaised`, `text`, `textMuted`, `accent`, `accentTint`, `accentContrast`, `hairline`, `controlBoundary`, `danger`, `dangerTint`, `scrim`, `focusRing`, `focusRingInner`), in light and dark. It does not change the font, the page background, the map overlay colours or the data palette. [Theme the interface](../tasks/theme-the-interface.md) has the code: generate the stylesheet in your build, serve it from your own origin and link it after the SDK's stylesheets, with a class that you own on an element around the `MapView` and its chrome.

What to know:

- The scope is `:root`, `#id` or `.class` with an ASCII name. Anything else, including a selector list, is refused. The scope is matched as a descendant of `:root`, so a class on `<html>` itself does nothing: use the `:root` scope to theme the whole page. Two maps with different themes are two wrappers, two scopes and two calls.
- The custom property names the stylesheet writes are generated and private, so generate it from the same installed `@mapcairn/theme` that provides `tokens.css`.
- The rules read `data-theme` on `<html>` (`light` or `dark`), or the system's colour scheme when it is not set. A `ThemeSource` of your own must set that attribute.
- The theme is skipped in high-contrast (`prefers-contrast: more`) and forced-colours modes, which keep the SDK's own values. The rules use negated media conditions, such as `(not (prefers-contrast: more))`. A browser that does not understand one treats it as false and so skips the theme, which falls back to the SDK's own colours.
- Where the surface is translucent, the stylesheet also sets an opaque surface for browsers without `backdrop-filter` and for reduced transparency, and sets the inner focus ring to it unless you chose one. The check covers those values.
- A tooltip renders in a portal under `body`, outside your wrapper. It takes the colours of the control it belongs to when it opens, so your theme reaches it under any scope, with nothing to add.
- Each colour must be hex, `rgb()`/`rgba()` or `oklch()`, and is written back as hex. `checkThemeContrast` reports the same findings without producing CSS, for a test of your own.

## Add a basemap

`BASEMAPS` holds every basemap the SDK defines. A host builds a catalogue from `BASEMAPS`, or from its own definitions, with `createBasemapCatalogue`, and passes it as `Services.basemaps`. [Choose a basemap](../tasks/choose-a-basemap.md) has the picker and the credits. To define a basemap of your own, write a `BasemapDefinition`:

- Its `name` is a `DefinitionText`: a `MessageKey` (`basemap.<id>.name`, with the English in `EN_GB_CATALOGUE`, so a language can translate it), a `HostText` (`{ key, text }`, translated from `MessageCatalogue.definitionTexts`) or a plain string, which is shown as written and is what a basemap of your own host can use.
- A `raster` source is a tile URL template with 256 px tiles, and a `vector` source is a MapLibre style URL.
- Set the zoom limits, the provider credits and `appearance`.
- Allow the provider's origins in your page's Content Security Policy: read the style and its tile sets to find every host they request (sprite, glyphs, terrain), and add only those (see [Content Security Policy](content-security-policy.md)).

A provider whose licence the reusable SDK packages must not carry, or whose volunteer-run server should not be sent the traffic of every app built on the SDK, or that asks to be told of use, is not added to `BASEMAPS`. Define it in your host instead, pass it to `createBasemapCatalogue` with the SDK's definitions you offer, and set `nonCommercial: true` if the licence bars commercial use, which keeps it out of the WebMCP basemap tool. The picker shows a preview image from `thumbnail`, a root-relative path to a file your host serves; the SDK ships no image files. A basemap with none shows a plain swatch, so set `swatch`, a hex colour of your own, for one that is not light, so its picker tile does not look like the default.

The default basemap follows the theme until a visitor chooses one: Bright in the light theme and Fiord in the dark theme. A host sets its own with `createBasemapCatalogue(basemaps, defaultId, { light, dark })`: `defaultId` is the fallback and a theme left out uses it. `Settings.basemapId` is `null` until the visitor picks a basemap; read the basemap to draw with `resolveBasemapFor(catalogue, id, theme)`.

To add a basemap to the reference site in this repository, follow [Add to the reference site](add-to-the-reference-site.md#add-a-basemap).

## Add a data layer

A layer is data, not code: one `LayerDefinition` (types in `@mapcairn/core`). Nothing in the code names a layer, a provider or a response shape. [Add a layer](../tasks/add-a-layer.md) gives a definition to the services and turns it on. [Serving layers to MapCairn](serving-layers.md) says which kind fits which server, what each costs it, and how to point a layer at an OGC API Features, WMS or WMTS service ([worked examples](serving-layers.md#services-that-speak-open-standards)). To add a layer to the reference site in this repository, follow [Add to the reference site](add-to-the-reference-site.md#add-a-data-layer).

A feed names its decoder (`geojson`, or one you register), maps fields by dotted path, and describes its style, card and list with templates such as `{time|relative}`. A colour rule needs a shape, a size or the field named on the card, so colour is never the only signal. A tile layer needs no code for a date or time its provider has no tiles for: when the map settles with none of the layer's tiles loaded, the layer's status says no imagery was found for the chosen date or time, beside its control, and says it once through the live region. The status goes when the control changes, or when a tile of the layer loads later, and the live region says so once.

The text a person reads in a definition (`name`, `description`, `group`, `disclaimer`, `emptyText`, control and option labels, the labels of a style's classes, sort labels, the card's link label and the detail source's `label` and `dataCost`) is a `MessageKey`, a `HostText` or a plain string. A plain string is shown as written, which is all a layer of your own host needs; a host that wants its own text translated writes `{ key, text }` and supplies `definitionTexts` in its catalogue (see the [translation guide](translate-the-sdk.md)), with `text` as the source and fallback.

Card titles and lines, list secondary lines, feed polygon and line labels, and range and interval units use `LayerTemplate`: the existing plain string or an object with a host-defined `key` and source `text`. The optional `MessageCatalogue.layerTemplates` record holds a translation by key; `createMessageCatalogue` accepts it as its fourth argument. A translation may reorder placeholders but must preserve every source field and formatter, including duplicates. If the key is missing or the placeholders differ, the source text is used. A unit includes its own spacing, such as ` per km²`. Vector-tile labels remain plain property names because the map engine reads them directly, and credits in `attribution` are never translated.

Check a definition with `validateLayerDefinition(definition, { decoders: createDecoderRegistry(), formatters: createFormatterRegistry() })` from `@mapcairn/core`, passing the registries your host uses. It returns a list of problems, empty when the definition is valid, and each names its path, such as `identify.fields.id`. A layer a catalogue loads goes through the same check, and is skipped with its problems when it fails. A minimal tile layer:

```ts check
import type { TileLayerDefinition } from "@mapcairn/core";

const example: TileLayerDefinition = {
  id: "example-overlay",
  name: "Example overlay",
  description: "What the overlay shows, in one sentence.",
  group: "Imagery",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [{ kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 }],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/{z}/{x}/{y}.png",
    tileSize: 256,
    maxzoom: 12,
  },
};

export default example;
```

If the provider fills the part of the world it has no data for with opaque or noisy tiles, add `bounds: [west, south, east, north]` (degrees) to the source, and the map asks for no tile that lies wholly outside the box (a tile that straddles an edge is still drawn whole, so check what the provider returns there). The box must have west less than east, so it cannot cross the antimeridian. This matters most near the poles: on a globe the map stretches the edge row of tiles over the pole, so filler there shows as wedges meeting at the pole. The population layer stops at 60 degrees south for this reason.

### Offer a date and a time

A product the provider names by timestamp, such as one image per half hour, takes a `datetime` control. Its value is the slot's start in UTC, written `YYYY-MM-DDtHHMM` so it fits a link, and the URL template receives it as an ISO instant (`2026-11-11T14:30:00Z`). Set `max` and `default` to the provider's latency with `{ minutesAgo }`, so times that are not out yet are never offered, and say the latency in the description. The ui shows a date input and a list of the times that exist on that day, both in UTC, with the slot shown and the newest one in words. From the half-hourly rainfall layer:

```ts no-check
{
  kind: "datetime",
  id: "time",
  label: "Half hour shown",
  description: "A few half hours have no data. If tiles fail to load, try another time.",
  stepMinutes: 30,
  min: "1998-01-01t0000",
  max: { minutesAgo: 420 },
  default: { minutesAgo: 420 },
}
```

with a tile URL such as `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`. Validation refuses a step that does not divide a day, a fixed bound off the step and a default outside fixed bounds. Find the latency by probing the provider's tiles over a few hours rather than trusting a capabilities document, which can lag.

## Style polygons and lines

A feed of polygons or lines uses a `shapes` style. Colour is a rule over one field: `fixed`, `category`, `steps` (explicit class breaks) or `intervals` (equal classes between a `min` and a `max`, one ordinal colour per class). Each class may also set a `pattern` (`stripes`, `dots`, `crosshatch`), a `dash` and a `width`, and a label template draws text with a halo. The key is derived from the style, and the Layers section and the map key (`MapKey`, in `MapChrome`'s `mapKey` slot) both draw it, so a layer needs nothing extra to appear in either. Colour is never the only signal, so validation asks for a different pattern, width or dash in every class, or a label that names the field. The colour names a palette slot, never a value.

```ts check
import type { FeedLayerDefinition, ShapeStyle } from "@mapcairn/core";

const districts: FeedLayerDefinition<ShapeStyle> = {
  id: "example-districts",
  name: "Districts by density",
  description: "Example districts shaded by people per square kilometre.",
  group: "Boundaries",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://data.example.org/districts.geojson",
    decoder: "geojson",
    fields: {
      id: "properties.code",
      title: "properties.name",
      density: "properties.density",
    },
  },
  style: {
    kind: "shapes",
    geometry: "area",
    colour: {
      kind: "intervals",
      field: "density",
      min: 0,
      max: 300,
      ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
      unit: " per km²",
      patterns: ["solid", "dots", "crosshatch"],
    },
    label: { template: "{title}", minzoom: 6 },
  },
  card: { title: "{title}", lines: ["About {density|number} per km²"] },
  list: {
    secondary: "About {density|number} per km²",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No districts could be shown.",
};

export default districts;
```

Labels need a basemap with a glyph source, which the vector basemaps have. On a raster basemap the map draws the fills, patterns and outlines without text, and the list and card keep the words. `world-countries.ts` is a working example, from Natural Earth country outlines.

## Add a heatmap

A `heatmap` layer draws point density from a feed (or a query) and has no cards or list. The radius and intensity come from `range` controls so people can tune it, and the legend names each step of the ramp with a word.

```ts check
import type { HeatmapLayerDefinition } from "@mapcairn/core";

const density: HeatmapLayerDefinition = {
  id: "example-density",
  name: "Event density",
  description: "How dense the example events are.",
  group: "Density",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [
    { kind: "range", id: "radius", label: "Radius", min: 4, max: 80, step: 2, default: 20, unit: " px" },
    { kind: "range", id: "intensity", label: "Intensity", min: 0.1, max: 5, step: 0.1, default: 1 },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "feed",
    url: "https://data.example.org/events.geojson",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", weight: "properties.size" },
  },
  heatmap: {
    weightField: "weight",
    radius: { control: "radius" },
    intensity: { control: "intensity" },
    ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
    words: ["Sparse", "Moderate", "Dense"],
  },
  emptyText: "No events to show.",
};

export default density;
```

## Add vector tiles

A `vector-tiles` layer names a tile URL, a zoom window for the layer, and a style per source layer. Rules read tile properties by name, and a label template may name one property, such as `{name}`. A source layer can also be a `heatmap`. The source's `minzoom` and `maxzoom` are the tile levels the service has; the layer's and each source layer's `minzoom` and `maxzoom` are the zoom levels they are visible at, from `minzoom` up to but not including `maxzoom`. Features stay in the tiles, so the layer has a key and no cards. When the map is outside the layer's own `minzoom` and `maxzoom`, its status line names the level to zoom to: "Zoom in to level 5 or closer to load this layer." or "Zoom out below level 12 to see this layer." A layer without a window says nothing about zoom, and the source's `maxzoom` does not count as one.

```ts check
import type { VectorTileLayerDefinition } from "@mapcairn/core";

const parks: VectorTileLayerDefinition = {
  id: "example-areas",
  name: "Parks and water",
  description: "Example areas and roads from vector tiles.",
  group: "Boundaries",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: { kind: "vector-tiles", tiles: "https://tiles.example.org/{z}/{x}/{y}.pbf", maxzoom: 14 },
  minzoom: 3,
  sourceLayers: [
    {
      sourceLayer: "areas",
      style: {
        kind: "shapes",
        geometry: "area",
        colour: {
          kind: "category",
          field: "kind",
          categories: [
            { value: "park", label: "Park", colour: "bluish-green", pattern: "dots" },
            { value: "water", label: "Water", colour: "sky-blue", pattern: "stripes" },
          ],
          other: { label: "Other area", colour: "orange" },
        },
      },
    },
    {
      sourceLayer: "roads",
      minzoom: 8,
      style: {
        kind: "shapes",
        geometry: "line",
        colour: {
          kind: "steps",
          field: "rank",
          steps: [
            { min: 0, label: "Minor road", colour: "ordinal-2", width: 1.5 },
            { min: 5, label: "Major road", colour: "ordinal-4", width: 4, dash: "dashed" },
          ],
        },
      },
    },
  ],
};

export default parks;
```

Tile origins go in `connect-src` and `img-src`, as for raster tiles.

## Identify features on a raster layer

A raster tile layer is a picture, so the tiles themselves have no features. To give a tap a card, add an `identify` block to the layer's definition. It names an `https` URL that answers, in JSON, what is at one point. The browser asks only when someone taps the plain map, or presses `I` for the centre of the map, and only while the layer is on. Hover, movement and a layer that is off send nothing.

```ts check
import type { IdentifiableLayerDefinition } from "@mapcairn/core";

const floodDepth: IdentifiableLayerDefinition = {
  id: "example-flood",
  name: "Flood depth",
  description: "Example modelled flood depth, with the depth at a tap.",
  group: "Imagery",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [
    {
      kind: "segmented",
      id: "period",
      label: "Return period",
      options: [
        { value: "20", label: "1 in 20 years" },
        { value: "100", label: "1 in 100 years" },
      ],
      default: "20",
    },
  ],
  source: {
    kind: "tiles",
    tiles: "https://tiles.example.org/flood/{period}/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 12,
  },
  identify: {
    url: "https://api.example.org/identify/{period}?lng={lng}&lat={lat}&bbox={bbox}&width={width}&height={height}&i={x}&j={y}&zoom={zoom}",
    tolerance: 12,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", depth: "properties.depth" },
    card: { title: "{title}", lines: ["{depth} m deep"] },
  },
};

export default floodDepth;
```

The `card` sits inside `identify`, not on the layer, and its `lines` list is required, though it may be empty.

While a layer with an `identify` block is on and showing imagery, its Layers section entry says "Tap the map to see details for this layer." after its legend, and the section adds "Only the first 4 layers are asked on one tap." when more than 4 such layers are on. The section cannot know where a tap will land or whether your host calls `identifyAt`, so it says this for every such layer, including one whose `bounds` miss the tapped place. If a tap takes longer than 400 ms to answer, a "Looking up what is here" line shows at the bottom of the map until the answer comes, or until Escape or the line's Dismiss button ends the lookup. The line says itself to a screen reader once when it appears, and the result is said once when it arrives. A host that builds its own chrome shows that line with `useIdentifyFeedback(layers.identifying)` and `<IdentifyStatus onCancel={layers.cancelIdentify} />` from `@mapcairn/map`, and calls `identifyAt` from its map click and its `I` key (`packages/web/src/app/useMapApp.ts` is the reference).

### Placeholders

The URL is filled for each tap. Every value is encoded, so a comma goes out as `%2C`, and the server decodes it like any query string.

| Placeholder           | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `{lng}`, `{lat}`      | The tapped place in WGS 84 degrees, to six decimal places.                                |
| `{bbox}`              | The box as `minx,miny,maxx,maxy` in EPSG:3857 metres, around the tap.                     |
| `{width}`, `{height}` | The box's size in pixels, which is 2 × tolerance + 1.                                     |
| `{x}`, `{y}`          | The tapped pixel's position in the box, which is the tolerance, so the middle of the box. |
| `{zoom}`              | The map's zoom level, to three decimal places.                                            |
| A control's id        | The layer's control value, as in its tile URL. `{period}` above.                          |

The URL must use `{lng}` and `{lat}`, or all of `{bbox}`, `{width}`, `{height}`, `{x}` and `{y}`. The scheme, host and port must be fixed text, with no placeholder in them. A control or derived variable may not be named `lng`, `lat`, `bbox`, `width`, `height`, `x`, `y` or `zoom`.

`tolerance` is a whole number of pixels from 1 to 20, and the default is 12. The box is a square of 2 × tolerance + 1 pixels at the map's zoom, centred on the tap. For a tap at 0, 0 at zoom 10 with the default tolerance, the request is:

```text
https://api.example.org/identify/20?lng=0&lat=0&bbox=-1910.926%2C-1910.926%2C1910.926%2C1910.926&width=25&height=25&i=12&j=12&zoom=10
```

The box is neither clamped nor shifted at the edges of the world. A tap's longitude is wrapped to -180 up to 180 first, so a tap at 179.9999 gives a box that runs past the edge of the world. Near a pole, `{bbox}` is centred on latitude 85.0511, the limit of Web Mercator, while `{lat}` keeps the tapped latitude. The server decides what to answer for either, and an answer with nothing in it is read as nothing found.

### What the answer may hold

The answer must be JSON, at most 1 MiB, and it is read in one of two shapes:

- **GeoJSON**, with `decoder: "geojson"`. It has a `features` list, and each feature's `fields` are read by dotted path. Coordinates are `[longitude, latitude]` in WGS 84 degrees. A feature with a position beyond 180 in longitude or 90 in latitude is dropped, so a server that answers in its own coordinate system reads as nothing found. A position inside those limits but in another unit would be drawn in the wrong place, so the server must answer in WGS 84. A feature with a missing or `null` geometry, as a server sends for a raster pixel value, is placed at the tap. A document with no `features` list is no features.
- **A JSON list**, with `records` naming its dotted path, such as `results`. `decoder` is still required with `records` and must name a registered decoder, and `geojson` is the usual choice. Each item becomes the properties of a feature at the tap, so a field reads `properties.name`. A path that is not a list is no features.

Without `records`, a decoder other than the built-in `geojson` gets the answer as it came. XML or GML, HTML, plain text (the default `GetFeatureInfo` formats on some servers), JSONP and a POST are not read. A server that cannot send JSON needs a small proxy that asks it and answers in JSON.

### Ids

`id` and `title` are required fields. Map `fields.id` to an attribute the service keeps stable, such as its own identifier. A feature with a missing, `null` or empty id takes its position in the answer. That is unique within one answer but can differ from one tap to the next, so it is not a stable id, and a host should avoid relying on it.

### Limits

A tap asks at most 4 tile layers, in catalogue order. A layer is asked only when it is on, has an `identify` block, covers the tapped place, and the map has not reported that it has no imagery. Any further layers are not asked, and the message says how many were, for example "Asked 4 of 6 layers.". Each request has 8 seconds to answer, and a layer that does not answer in time is named in the message. A layer shows at most 20 features from one answer, and the rest are dropped.

One feature opens its card. Several open a list to choose from. Nothing found says "Nothing found here.", and a layer that did not answer is named in the same message.

### Requests and the page

The request is a `GET` over `https` with no cookies and no referrer, in CORS mode. Its answer is not cached, whatever its `Cache-Control`, because a tap's URL never repeats.

- **Content Security Policy.** The request is a `fetch`, so the host page's `connect-src` must list the identify origin. When it is the same origin as the layer's tiles, that origin is already in `connect-src` and `img-src` and nothing more is needed. A separate API origin goes in the host's policy, as the [Content Security Policy guide](content-security-policy.md) describes.
- **CORS.** The identify endpoint must send `Access-Control-Allow-Origin` for the host's origin. A server that sends it for its tiles may not send it for an identify endpoint, and the browser then refuses the answer, which the layer reports as "did not answer".

## Ask only for what is in view

For a dataset too large to fetch whole, use a `query` source in place of a `feed`. The layer asks for the features inside the current view, after the map has been still for a moment, and asks again only when the view leaves the area it last asked for. A view across the antimeridian is asked for as two boxes, one on each side of the line, each inside -180 to 180, so it costs two requests to the provider instead of one; the answers are joined and a feature in both (the same id and geometry) is kept once. If either request fails the layer shows its error and nothing partial, and each half can return up to `maxFeatures` plus one, so such a view can fetch up to twice the data. It draws at most `maxFeatures`, says "Showing the first N. Zoom in to see more." when there are more, and below `minzoom` asks for nothing and says "Zoom in to level 9 or closer to load this layer.", naming the normalised zoom level the map readout shows. The URL must use `{west}`, `{south}`, `{east}` and `{north}`, and may use `{limit}`, which is `maxFeatures` plus one so the response shows that more exist.

```ts check
import type { FeedLayerDefinition, PointStyle } from "@mapcairn/core";

const places: FeedLayerDefinition<PointStyle> = {
  id: "example-places",
  name: "Places in view",
  description: "Example places, requested for the part of the map in view.",
  group: "Places",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "query",
    url: "https://api.example.org/places?bbox={west},{south},{east},{north}&limit={limit}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", kind: "properties.kind" },
    maxFeatures: 500,
    minzoom: 9,
  },
  style: { colour: { kind: "fixed", colour: "blue", label: "Place" } },
  card: { title: "{title}", lines: ["{kind}"] },
  list: {
    secondary: "{kind}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No places in view.",
};

export default places;
```

## Supply layers at runtime

A host with a server of its own usually holds its layer metadata in that server's format, not as MapCairn definitions. [Serving layers to MapCairn](serving-layers.md) covers what a host's server should serve and how `createRuntimeLayerCatalogue` behaves. To turn the server's format into definitions, a host writes a mapper. `examples/embed/src/mapServerLayers.ts` in this repository is a sample, for a made-up server whose answer is a constant, so nothing is requested.

The mapper builds definitions from what the SDK already offers, and meets these limits:

- **An id** is lowercase letters, digits and hyphens, so `Huts_2024` becomes `huts-2024`. Take braces out of a label so a server cannot open a template placeholder.
- **Colours** come from the palette in order and never from the server: the palette has five ordinal colours and seven categorical ones. A rule has at most five classes, or six values and the class for every other value, and equal intervals need at least two classes. The SDK's point styles take `steps` and no `intervals`, so equal intervals map for polygons and lines only.
- **A polygon or line coloured by a field** also needs a label that names that field, because the SDK needs a second signal beyond colour.
- **A tile service** becomes a raster layer whose legend is on the ordinal colours, so the legend has at most five entries.

The mapper does not check what it makes. A layer it cannot use becomes a candidate the catalogue skips, as `partitionDefinitions` does for any definition, and `onSkipped` gets the layer's id and each problem as a `path: message` line, for example `source.fields.title: is required`. The checks stay in core, and the layers around a skipped one are unaffected. The mapper's input should be typed, and a host that receives raw JSON checks that it is an object with a `layers` array before it maps it. Test the mapper with a payload it can map and one it cannot, as the sample's `mapServerLayers.test.ts` does.

## Add a routing provider

The Directions tool appears only when `services.routing` exists, and the SDK ships no provider. To offer directions, write one adapter and pass it as `routing` in the `Services` your app builds, as "Register it" under "Write a search provider" shows.

1. Implement `RoutingProvider` from `@mapcairn/core`. `route({ stops, mode, signal })` returns one line feature for each leg with its distance in metres and time in seconds, and `reachableArea({ origin, minutes, mode, signal })` returns polygon features. Reject only with `RoutingError` (`network`, `invalid`, `no-route`, `rate-limited`, `aborted`, `unsupported`), and honour the `AbortSignal`. Keep to the service's usage limits inside the adapter and send no cookies.
2. Run `runRoutingProviderContract` against it with a scripted `fetch`, and add recorded sample responses as fixtures. Read every body, an error body included, through a bounded reader with a limit that fits the service, and make the contract subject lower it so `respondWithOversizeAnswer()` stays small: an answer over the limit must fail as `invalid`.
3. Register it as `routing` in the `Services` your app builds. Nothing else in the app names it.
4. Allow its origin in your page's `connect-src` (see [Content Security Policy](content-security-policy.md)), and pass its credit and a note about what a request sends to the Directions panel (`note`).

Send a referrer only where the service's terms ask for one, and then only your site's origin: a browser never puts the address fragment in a Referer. The SDK carries no provider's terms. Read your provider's terms before you use a public server, and a host that is commercial, has high traffic or needs the service to stay up should run its own routing service. Leave `routing` out and the Directions button, panel and overlays are never mounted, so a host without a service carries no dead controls. To change the reference site's provider, follow [Add to the reference site](add-to-the-reference-site.md#add-a-routing-provider).

## Write a search provider

The search pill, the address lookup on the pin card and the map's move to a result all work on two ports from `@mapcairn/core`, and the SDK ships no adapter for a named service, because a service's terms must not travel inside an SDK package. A host writes its own, over a geocoder it runs or is allowed to use, or over an index it owns. `examples/embed/src/placeSearch.ts` in this repository is a sample over a few invented places held in memory.

### The two ports

`SearchProvider` is required (`Services.search`) and has two methods:

- `search(query, { bias, limit, signal })` resolves a `SearchResult[]`, best match first, empty when nothing matches.
- `reverse(position, { signal })` resolves the `SearchResult` at a position, or `null` when there is none.

`SuggestionProvider` is optional (`Services.suggestions`) and has one, `suggest(query, { limit, signal })`, which resolves `SearchResult[]` for text the person has only partly typed. It is a port of its own because a service that suits a submitted search often forbids a request on every keystroke. Leave it out and the pill keeps submit-only search; see [Add search suggestions](#add-search-suggestions). A provider that has nothing to suggest resolves `[]`, and the pill then lists nothing and still searches on Enter.

Every `SearchResult` has these fields (`packages/core/src/ports/search.ts`):

| Field            | Meaning                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | A string that names the place in this answer. The pill uses it as the option's key, so two results in one answer must not share one.               |
| `label`          | The place's short name, which the pill shows and puts in the box when the person picks it.                                                         |
| `secondaryLabel` | Optional. What helps tell places of one name apart, such as the parish or town.                                                                    |
| `centre`         | `{ lat, lng }`, in degrees. Required.                                                                                                              |
| `bounds`         | Optional `{ south, west, north, east }`. When present, a host that follows the reference site fits the map to it instead of centring on the point. |

Moving the map is the host's job, not the provider's or the pill's: the pill calls its `onSelect` prop with the picked result. The reference host fits the map to `bounds` when there are some and otherwise centres at a fixed zoom, and the sample's `src/showResult.ts` does the same. A host that only reads `centre` still works, but frames a glen or a lake as a point.

### What the pill and the provider each do

The pill (`useSearch` in `packages/map/src/tools/SearchPill`) searches only when the person submits, for at least two characters after trimming. It answers a typed coordinate pair itself, without the provider, and aborts the request before a new one starts, so a provider never needs to track which answer is current. When a search finds exactly one place, `SearchPill` goes straight to it (`UseSearchOptions.onPick`, which a host using `useSearch` alone may pass; it returns `false` to decline, and the single result then shows as a list), as long as the search box still has focus, and announces "Showing {label} on the map." instead of the count. It passes `bias` only when the host gives `SearchPill` a `getBias` function, so a provider can ignore `bias` and a host that sends it must say so in its privacy text.

The provider owns what is particular to its service: building the request, mapping the answer, and keeping to the service's usage limits (such as a minimum time between requests), since every caller shares them. For a blank query it resolves `[]` or rejects with a `SearchError`; the contract accepts either, and resolving `[]` without a request is simpler and sends nothing.

### Errors and cancellation

Reject only with these two, and do not let a raw `TypeError` or `SyntaxError` escape:

- `SearchError`, with a `kind`: `offline` (the request could not be made because the device has no connection), `rate-limited` (the service answered HTTP 429, or its equivalent) or `failed` (anything else, including a bad status, a body that is not what the service documents and a timeout). The pill shows a message for each kind and a Retry button, and treats any other error as `failed`.
- `PortAbortError`, when the `AbortSignal` fires. The pill ignores it: an aborted request never changes what is shown or reaches the live region.

To honour the signal, throw `PortAbortError` at the start if `signal.aborted` is already true, pass the signal to `fetch`, and turn the `AbortError` that `fetch` rejects with (or any failure after `signal.aborted` became true) into `PortAbortError`. `getJson` in the sample's `placeSearch.ts` does all three, and tells `offline` from `failed` with `navigator.onLine`.

### Map an answer to results

Keep the mapping in small functions that take the service's raw item and return a `SearchResult` or `null`, and drop an item that has no usable position instead of failing the whole answer.

A service that returns a GeoJSON `FeatureCollection`, as several open geocoders do, puts the point in `geometry.coordinates` as `[longitude, latitude]` and, when it has one, the extent in `bbox` as `[west, south, east, north]` (RFC 7946). Some services use a different order for their own extent field, so read the service's documentation and test with a recorded answer.

```ts check
import type { Bounds, SearchResult } from "@mapcairn/core";

interface GeocoderFeature {
  readonly geometry?: { readonly coordinates?: readonly number[] };
  readonly bbox?: readonly number[];
  readonly properties?: {
    readonly id?: string;
    readonly name?: string;
    readonly region?: string;
  };
}

function toBounds(bbox: readonly number[] | undefined): Bounds | undefined {
  if (bbox?.length !== 4) {
    return undefined;
  }
  const [west, south, east, north] = bbox as [number, number, number, number];
  return { south, west, north, east };
}

function toResult(feature: GeocoderFeature): SearchResult | null {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const { id, name, region } = feature.properties ?? {};
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof lng !== "number" ||
    typeof lat !== "number"
  ) {
    return null;
  }
  const bounds = toBounds(feature.bbox);
  return {
    id,
    label: name,
    ...(region ? { secondaryLabel: region } : {}),
    centre: { lat, lng },
    ...(bounds ? { bounds } : {}),
  };
}
```

A plain JSON endpoint is the same job with that endpoint's names: the sample's service sends `{ results: [{ id, name, area, lat, lon, box }] }`, with `box` as `[south, west, north, east]`, and `toSearchResult` in its `placeSearch.ts` maps one item. Check each field's type before you use it, since the body comes from outside your code.

### Test it with the contract suite

The SDK's contract suites check what the ports promise: the shape of a result, an empty array for no match, each `SearchError` kind, `PortAbortError` before and during a request, and `null` from `reverse` when there is no place. Run them against your adapter with the network scripted:

```ts no-check
import {
  runSearchProviderContract,
  runSuggestionProviderContract,
} from "@mapcairn/core/contracts";

runSearchProviderContract("MySearchProvider", () => {
  const scripted = scriptedFetch(); // your test double for the service
  return {
    // A small limit keeps the oversize answer below small.
    provider: new MySearchProvider({ fetch: scripted.fetch, maxResponseBytes: 1024 }),
    controls: {
      willReturn: (results) => scripted.answerWith(results),
      willFail: (kind) => scripted.failWith(kind), // "offline", "rate-limited" or "failed"
      respondWithOversizeAnswer: () => scripted.answerWithBytes(2048),
      hold: () => scripted.holdUntilAborted(),
    },
  };
});
```

`create` is called for each test, so every test gets a fresh provider. `willReturn` makes every later `search` return those results and `reverse` return the first, or `null` for an empty list; `hold` keeps the next request pending until its signal aborts, so the double must reject with an `AbortError` when `init.signal` fires. `respondWithOversizeAnswer` makes every later request read an answer larger than the limit your provider puts on the size of an answer (lower the limit in the subject so the answer stays small), and the suite requires the request to fail as `failed`. `runSuggestionProviderContract` takes the same controls. Read the body through a bounded reader of your own, so a service cannot make the page hold an answer of any size. The suites import `vitest`, which `@mapcairn/core` declares as an optional peer, so the host installs it with its tests. The contract does not check your mapping of a real answer, so also test it with recorded answers from the service, a bad item, a body that is not JSON and an HTTP error.

### Register it

Pass the provider in the `Services` the app is built from. A host that builds its own `Services` sets `search` and, if it has one, `suggestions`; the example starts from the fakes and replaces the two parts:

```ts no-check
const services = createFakeServices({
  search: new MySearchProvider(),
  suggestions: new MySuggestionProvider(),
});
```

`ServicesProvider` takes the result as `services`, and nothing else in the app names the provider. If the service is on another origin, allow it in the page's `connect-src` (see the [Content Security Policy guide](content-security-policy.md)).

### Tell visitors what is sent

A search provider sends data to whatever its service is, so the host's privacy text must say so plainly. By default these requests are sent:

- A submitted search sends the query text to the service, and with it whatever the browser always sends, such as the visitor's IP address and user agent. With a `SuggestionProvider`, the text typed so far is sent as the person types, which is more than a submitted search sends, so the text must say that too.
- The address lookup on the pin card sends the pin's position, rounded to four decimal places (about 11 m) by `roundForLookup`, and only when the person asks for it.
- A `bias` box is sent only if the host gives `SearchPill` a `getBias` function and the provider passes it on, and it shows roughly which area the person is looking at.
- The visitor's language is sent only if the adapter sends it (see the [translation guide](translate-the-sdk.md)).

The words are the host's. `PinCard` takes a `lookupNote` for the line under "Look up address", and `SheetContent` and `SettingsSection` take a `privacyNote` for Settings. The defaults name no service because the SDK does not know which one a host uses.

## Add search suggestions

The search pill suggests places as the person types only when `services.suggestions` exists, and the SDK ships no provider, because a service built for typing has its own terms. To offer suggestions, write one adapter and register it, as for routing:

1. Implement `SuggestionProvider` from `@mapcairn/core`. `suggest(query, { limit, signal })` resolves `SearchResult`s, each with a centre and optionally an extent, so picking one needs no second lookup. Reject only with `SearchError` (`offline`, `rate-limited`, `failed`) or `PortAbortError`, give each request a timeout, keep to the service's usage limits inside the adapter, and send no cookies or referrer.
2. Run `runSuggestionProviderContract` against it with a scripted `fetch`.
3. Register it as `suggestions` in the `Services` your app builds. Leave it out and the pill keeps submit-only search.
4. Allow its origin in `connect-src`, and say in your privacy text that the text typed so far goes to the service as the person types. That is more than a submitted search sends.

When to ask is not the adapter's job. `useSuggestions` waits for a pause in typing, asks for at least three characters, cancels what a newer keystroke supersedes, stops for a cooldown after repeated failures and announces once that suggestions are unavailable. A public service has terms of its own: read them, and a host that is commercial, or that expects real traffic, should run its own server. To change the reference site's provider, follow [Add to the reference site](add-to-the-reference-site.md#add-search-suggestions).

## Add an adapter

Define the port, write its fake and contract suite, and write the real adapter. A host that builds its own `Services` may supply any adapter that passes the port's contract suite (the suites import `vitest`, which `@mapcairn/core` declares as an optional peer, so the host installs it with its tests). `fileOpener` and `suggestions` are optional, as `routing` is: leave it out and the Shapes section has no Import control, or supply one, for example a native app's own picker, that passes `runFileOpenerContract`. To add a port to the SDK or the reference site, [`ARCHITECTURE.md`](https://github.com/MapCairn/mapcairn/blob/main/ARCHITECTURE.md#adding-an-adapter) has the steps.
