---

title: Choose a basemap
sidebar_label: Choose a basemap
description: Let people pick a basemap, show its credits, and offer only the basemaps you want.
---

# Choose a basemap

This page is for a developer whose map already shows, as in [Get started](../get-started.md), and who wants people to choose the basemap, or wants to limit the choice. By the end the map will have a basemap picker and the credits that the basemap's provider asks for, and you will know how to change which basemaps are offered.

Checked against `@mapcairn/sdk` %sdkVersion%, the version in this repository. The code uses [`useBasemaps`](../api/map/useBasemaps.md), [`BasemapPicker`](../api/map/BasemapPicker.md), [`Attribution`](../api/map/Attribution.md), [`defaultBasemapFor`](../api/core/defaultBasemapFor.md) and [`createBasemapCatalogue`](../api/core/createBasemapCatalogue.md).

## What a basemap is

A basemap is a `BasemapDefinition`: an id, a name and a source, which is a vector style, raster tiles or a hybrid of both. The SDK's built-in list, [`BASEMAPS`](../api/core/BASEMAPS.md), holds Bright, Liberty, Fiord, Dark and Positron from OpenFreeMap, Colorful from VersaTiles and a raster Streets map from OpenStreetMap. These are public servers that the visitor's browser asks directly, so read each provider's terms before you ship one. The adapter asks for nothing until a map mounts, and then only for the basemap you pass `MapView`.

`useBasemaps()` returns the catalogue the app offers. `MapView` takes the one to draw in its `basemap` prop and swaps it when the prop changes.

## Add a picker and the credits

Create `src/basemap.tsx` with this. It has its own `MapScreen`, which keeps the choice in state and shows the theme's default basemap until a person chooses one. A button in the `topStart` slot, where Get started has the search box, opens a sheet with the picker, and the credits sit at the bottom:

```tsx check
import {
  Attribution,
  BasemapPicker,
  Button,
  defaultBasemapFor,
  FocusRegistryProvider,
  MapChrome,
  MapView,
  Sheet,
  type SheetDetent,
  useBasemaps,
  useMap,
  useTheme,
} from "@mapcairn/sdk";
import { type ReactNode, useState } from "react";

export function MapScreen() {
  const catalogue = useBasemaps();
  const { resolved } = useTheme();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const basemap =
    chosenId === null
      ? defaultBasemapFor(catalogue, resolved)
      : catalogue.resolve(chosenId);
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 11, bearing: 0 }}
      basemap={basemap}
      chrome={(background) => (
        <Chrome
          background={background}
          basemapId={basemap.id}
          onBasemapChange={setChosenId}
        />
      )}
    />
  );
}

interface ChromeProps {
  readonly background: ReactNode;
  readonly basemapId: string;
  readonly onBasemapChange: (id: string) => void;
}

function Chrome({ background, basemapId, onBasemapChange }: ChromeProps) {
  const map = useMap();
  const catalogue = useBasemaps();
  const [open, setOpen] = useState(false);
  const [detent, setDetent] = useState<SheetDetent>("half");
  const [modal, setModal] = useState(false);
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={modal}
        topStart={
          <Button variant="secondary" onClick={() => setOpen(!open)}>
            Basemap
          </Button>
        }
        bottomEnd={<Attribution basemap={catalogue.resolve(basemapId)} />}
        sheet={
          <Sheet
            id="basemap-sheet"
            open={open}
            title="Basemap"
            detent={detent}
            onDetentChange={setDetent}
            onModalChange={setModal}
            onClose={() => setOpen(false)}
          >
            <BasemapPicker value={basemapId} onChange={onBasemapChange} />
          </Sheet>
        }
      />
    </FocusRegistryProvider>
  );
}
```

Now change `src/main.tsx`. Delete `MapScreen` and `Chrome`, and the imports only they used, and add this import. `services`, the providers in `App` and the mount stay as they are in Get started:

```ts no-check
import { MapScreen } from "./basemap";
```

`defaultBasemapFor(catalogue, resolved)` gives Bright in the light theme and Fiord in the dark theme with the built-in catalogue. Until someone picks a basemap the default follows the theme; after that the chosen id stays. Pressing the tile that is already shown counts as choosing it. The picker's tiles are plain colour swatches, because the built-in definitions name no preview image; a definition of your own can name one in `thumbnail`. A saved id that the catalogue no longer holds opens on the catalogue's default, because `resolve` never fails.

`Attribution` writes the credits the basemap's definition carries. A provider's terms usually require them to be visible, so keep it on any map you publish. The credits show for a few seconds and then collapse to a button.

## Offer fewer basemaps

The picker lists what the catalogue holds. To offer a subset, build a catalogue and pass it as `Services.basemaps`. Create `src/services.ts` with this, which offers two basemaps, with Fiord as the default in the dark theme:

```tsx check
/// <reference types="vite/client" />
import {
  BASEMAPS,
  createBasemapCatalogue,
  createFakeServices,
} from "@mapcairn/sdk";
import { createMapLibreMapAdapter } from "@mapcairn/sdk/adapter-maplibre";

const offered = BASEMAPS.filter(({ id }) => id === "bright" || id === "fiord");

export const services = createFakeServices({
  basemaps: createBasemapCatalogue(offered, "bright", { dark: "fiord" }),
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
```

`createBasemapCatalogue` throws, at start-up, if the list is empty, repeats an id or leaves out the default. In `src/main.tsx`, delete `services` and the imports only it used, and add `import { services } from "./services";`.

## Add a basemap of your own

A definition of your own is plain data: an id, a name, a source and the attribution. [Extending MapCairn](../guides/extending.md#add-a-basemap) lists the fields and the other things a new basemap needs, and [Content Security Policy](../guides/content-security-policy.md) says which origins a strict policy needs for it.

## When it goes wrong

A basemap can fail to load, and a provider can be down. `MapView` tells your app in two ways, and the SDK shows nothing itself:

- `onBasemapError(error, failed, kept)` is called when a change of `basemap` could not load. The map keeps drawing `kept`, the basemap that last loaded, and the error is a `MapEngineError` that is not an engine failure: `useMap().error` stays null. Pass `kept` back as `basemap`, by setting your own choice to `kept.id`, so the picker shows what the map draws. Passing it back causes no second swap.
- `onBasemapUnavailable(basemap)` is called when every tile of the basemap being drawn failed and none loaded, once the map has settled. The map keeps working, and your app decides whether to draw another basemap instead.

The English catalogue has words for both: `app.banner.basemapFailed` ("That basemap could not be loaded.") and `app.banner.basemapUnavailable` ("{name} is not available right now."). The picker cannot be empty, because a catalogue needs at least one basemap, and a catalogue that is built wrong stops the app at start-up with a message that [Troubleshooting](../troubleshooting.md) explains.

## Next steps

- [Extending MapCairn](../guides/extending.md#add-a-basemap) says how to define a basemap of your own.
- [Troubleshooting](../troubleshooting.md) lists the messages a failed basemap logs.
- [Add a data layer](add-a-layer.md) draws data over the basemap you chose.
