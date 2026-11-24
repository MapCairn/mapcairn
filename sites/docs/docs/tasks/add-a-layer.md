---

title: Add a data layer
sidebar_label: Add a data layer
description: Describe a raster tile layer as data, give it to the services and turn it on over the map.
---

# Add a data layer

This page is for a developer whose map already shows, as in [Get started](../get-started.md), and who wants to draw a data layer over it. By the end you will have a raster tile layer defined as data, listed in a catalogue, turned on from a button, with its credit in the corner of the map.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The code uses [`createStaticLayerCatalogue`](../api/core/createStaticLayerCatalogue.md), [`useDataLayers`](../api/map/useDataLayers.md), [`MapDataLayers`](../api/map/MapDataLayers.md) and [`Attribution`](../api/map/Attribution.md), and the [`TileLayerDefinition`](../api/core/TileLayerDefinition.md) type.

## What a layer is

A layer is data, not code: a definition with an id, a name, a source, the credit and what the person can adjust. Nothing in the SDK names a layer or a provider. The browser asks the provider directly, and only after the layer is turned on, so a layer that is never switched on costs nothing.

There are tile, feed, vector tile, heatmap and query layers. A tile layer is the simplest and is the one used here; [Extending MapCairn](../guides/extending.md#add-a-data-layer) shows the other kinds, with a definition for each.

## Define the layer and give it to the services

Create `src/layers.tsx` with this. It has its own `services` and `MapScreen`, and its `topStart` slot holds the layer button where Get started has the search box. The tile address is a placeholder: use the address of tiles you may use, and read the provider's terms first.

```tsx check
/// <reference types="vite/client" />
import {
  Attribution,
  type BasemapDefinition,
  Button,
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createStaticLayerCatalogue,
  type DataLayers,
  defaultBasemapFor,
  FocusRegistryProvider,
  MapChrome,
  MapDataLayers,
  MapView,
  type TileLayerDefinition,
  useBasemaps,
  useDataLayers,
  useMap,
  useTheme,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";
import type { ReactNode } from "react";

const OVERLAY: TileLayerDefinition = {
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

export const services = createFakeServices({
  layers: createStaticLayerCatalogue([OVERLAY], {
    decoders: createDecoderRegistry(),
    formatters: createFormatterRegistry(),
  }),
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

export function MapScreen() {
  const catalogue = useBasemaps();
  const { resolved } = useTheme();
  const layers = useDataLayers();
  const basemap = defaultBasemapFor(catalogue, resolved);
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 9, bearing: 0 }}
      basemap={basemap}
      chrome={(background) => (
        <Chrome background={background} basemap={basemap} layers={layers} />
      )}
    >
      <MapDataLayers layers={layers} />
    </MapView>
  );
}

interface ChromeProps {
  readonly background: ReactNode;
  readonly basemap: BasemapDefinition;
  readonly layers: DataLayers;
}

function Chrome({ background, basemap, layers }: ChromeProps) {
  const map = useMap();
  const overlayOn =
    layers.layers.find(({ definition }) => definition.id === OVERLAY.id)
      ?.enabled ?? false;
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={false}
        topStart={
          <Button
            variant="secondary"
            onClick={() => layers.setEnabled(OVERLAY.id, !overlayOn)}
          >
            {overlayOn ? "Hide the overlay" : "Show the overlay"}
          </Button>
        }
        bottomEnd={
          <Attribution basemap={basemap} layerCredits={layers.credits} />
        }
      />
    </FocusRegistryProvider>
  );
}
```

Now change `src/main.tsx`. Delete `services`, `MapScreen` and `Chrome`, and the imports only they used. Add this import. The providers in `App` and the mount stay as they are in Get started:

```ts no-check
import { MapScreen, services } from "./layers";
```

`createStaticLayerCatalogue` checks every definition when the app starts and throws an error that lists each problem, prefixed with the layer's id, so a mistake in a definition stops the app at once and does not wait for someone to turn the layer on. The decoder and formatter registries are what a definition's feed fields and templates are checked against; a tile layer uses neither, but the catalogue needs them.

## Turn it on

`useDataLayers()` holds which layers are on, their controls and their credits. `layers.setEnabled(id, true)` turns one on, and `MapDataLayers` draws what is on, as a child of `MapView`. The button above is one way to switch a layer. The SDK also has a ready-made list with a switch, a legend and the layer's controls: [`LayersSection`](../api/map/LayersSection.md), which the reference site shows in its sheet.

`layers.credits` holds the credit of every layer that is on, and `Attribution` shows it with the basemap's, so a layer's credit appears when it is turned on and goes when it is turned off.

## Layers from a server

A host whose layers come from a server, or can be wrong without stopping the app, builds the catalogue with [`createRuntimeLayerCatalogue`](../api/core/createRuntimeLayerCatalogue.md) instead. It validates each definition alone, leaves out one that fails and tells you why. [Extending MapCairn](../guides/extending.md#supply-layers-at-runtime) describes it.

## Before you publish

A layer's origin must be allowed by your Content Security Policy: tile origins in `connect-src` and `img-src`, feeds in `connect-src`. [Content Security Policy](../guides/content-security-policy.md) says how. Name the provider in your privacy notice, because the visitor's browser contacts it.

## When it goes wrong

A layer is requested only after it is turned on, so a failure shows only then. The browser asks the provider directly, and the SDK tracks what comes back:

- **A tile layer that is slow or fails.** A layer's `status.kind` is `on` until the map reports that it is still waiting for its first tile, when it becomes `tiles-slow`, and `tiles-unavailable` when none of its tiles loaded. Either clears when a tile loads later, or the layer is turned off. The button in the code above shows nothing for these, so read the status yourself. [`LayersSection`](../api/map/LayersSection.md) shows words for them: "Still waiting for imagery. The provider may be slow or not answering." and then "Could not load. Check your connection."
- **A feed layer that fails.** The status reads "Could not load. Check your connection." when the network failed, "Could not load. You are offline." when the visitor is offline, and "Could not load: the provider sent something unexpected." when the answer could not be read. `layers.retry(id)` asks again.
- **A layer with nothing to show.** A feed that decodes to no features says its definition's `emptyText`, after "Updated {time}."
- **A definition that is wrong.** `createStaticLayerCatalogue` stops the app at start-up with every problem listed, so nothing reaches the person. [Troubleshooting](../troubleshooting.md) has an example.

The map and the other layers keep working while one layer fails.

## Next steps

- [Extending MapCairn](../guides/extending.md#add-a-data-layer) shows the other kinds of layer, with a definition for each.
- [Troubleshooting](../troubleshooting.md) explains a layer definition that is refused.
- [Draw and edit shapes](draw-shapes.md) lets people add their own shapes over the layers.
