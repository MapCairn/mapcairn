---

title: Draw and edit shapes
sidebar_label: Draw and edit shapes
description: Add the draw tool to a map so people can place points, lines, areas and circles, edit them, and export them.
---

# Draw and edit shapes

Let people draw on the map from [Get started](../get-started.md): clicks become the corners of a shape, which has handles to edit it, with a toolbar and a sheet of shapes that offers undo, delete and export.

The code uses [`useDraw`](../api/map/useDraw-function.md), [`DrawToolbar`](../api/map/DrawToolbar.md), [`DrawOverlay`](../api/map/DrawOverlay.md), [`DrawMapBindings`](../api/map/DrawMapBindings.md), [`ShapesSection`](../api/map/ShapesSection.md), [`Sheet`](../api/map/Sheet.md) and [`MapOverlayLayer`](../api/map/MapOverlayLayer.md).

## How the pieces fit

The state of the tool is one hook, `useDraw`. It holds the shapes, what is selected, undo and redo, and every way to change them by pointer and by keyboard. The pieces that show it are separate, so you place them where your layout wants them:

- `DrawOverlay` draws the shapes and their handles on the map, inside `MapOverlayLayer`.
- `DrawMapBindings` passes the map's handle drags and hovers to the hook, and gives the map the handles to draw. It draws nothing itself and goes inside `MapView`.
- `DrawToolbar` is the toolbar: the kind of shape, finishing, undo and redo, and a button that opens the list of shapes.
- `ShapesSection` is that list, with export and import, for a sheet.

The shapes belong to the app, not to the toolbar, so they stay on the map when the tool closes. Nothing is stored, and nothing reaches the address bar.

## A map you can draw on

Create `src/draw.tsx` with this. It has its own `MapScreen`, with the toolbar in the `bottomCentre` slot, and no search box. It leaves the tool open all the time, to keep the example short, so its "Done" button only deselects the shape. The reference site opens the tool from a button and closes it with "Done".

```tsx check
import {
  DrawMapBindings,
  DrawOverlay,
  DRAW_KEY_HELP,
  DrawToolbar,
  defaultBasemapFor,
  FocusRegistryProvider,
  type MapContextValue,
  MapChrome,
  MapOverlayLayer,
  MapView,
  Sheet,
  ShapesSection,
  type SheetDetent,
  type UseDraw,
  useBasemaps,
  useDraw,
  useMap,
  useSettings,
  useTheme,
} from "@mapcairn/sdk";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

const SHEET_ID = "shapes-sheet";

export function MapScreen() {
  const catalogue = useBasemaps();
  const { resolved } = useTheme();
  const { settings } = useSettings();
  const mapRef = useRef<MapContextValue | null>(null);
  const draw = useDraw({
    units: settings.units,
    active: true,
    getAdapter: () => mapRef.current?.adapter ?? null,
  });
  return (
    <MapView
      initialView={{ center: { lat: -33.92, lng: 18.42 }, zoom: 13, bearing: 0 }}
      basemap={defaultBasemapFor(catalogue, resolved)}
      cursor="crosshair"
      onClick={draw.onMapClick}
      onKeyCommand={draw.keyCommand}
      keyHelp={DRAW_KEY_HELP}
      chrome={(background) => (
        <Chrome background={background} draw={draw} mapRef={mapRef} />
      )}
    >
      <MapOverlayLayer>
        {draw.shapes.length > 0 ? (
          <DrawOverlay
            shapes={draw.shapes}
            selection={draw.selection}
            handles={draw.handles}
            hoveredHandle={draw.hoveredHandle}
          />
        ) : null}
      </MapOverlayLayer>
      <DrawMapBindings draw={draw} />
    </MapView>
  );
}

interface ChromeProps {
  readonly background: ReactNode;
  readonly draw: UseDraw;
  readonly mapRef: { current: MapContextValue | null };
}

function Chrome({ background, draw, mapRef }: ChromeProps) {
  const map = useMap();
  useLayoutEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [mapRef, map]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detent, setDetent] = useState<SheetDetent>("half");
  const [modal, setModal] = useState(false);
  return (
    <FocusRegistryProvider focusMap={map.focusMap}>
      <MapChrome
        background={background}
        modal={modal}
        bottomCentre={
          <DrawToolbar
            draw={draw}
            onDone={draw.deselect}
            onOpenShapes={() => setSheetOpen(true)}
          />
        }
        sheet={
          <Sheet
            id={SHEET_ID}
            open={sheetOpen}
            title="Shapes and export"
            detent={detent}
            onDetentChange={setDetent}
            onModalChange={setModal}
            onClose={() => setSheetOpen(false)}
          >
            <ShapesSection draw={draw} />
          </Sheet>
        }
      />
    </FocusRegistryProvider>
  );
}
```

Now change `src/main.tsx`. Delete `MapScreen` and `Chrome`, and the imports only they used, and add this import. `services`, the providers in `App` and the mount stay as they are in Get started:

```ts no-check
import { MapScreen } from "./draw";
```

## What people can do

The toolbar chooses the kind of shape: Point, Line, Polygon or Circle. A click or tap on the map adds a corner to the shape being drawn, and "Finish" completes it and selects it for editing. A selected shape shows handles at its corners and midpoints that can be dragged, and dragging a midpoint adds a corner. The toolbar also has undo and redo, delete, and a button that opens the list of shapes.

Every action has a keyboard form. `draw.keyCommand` reads the keys when `MapView` gives it its `onKeyCommand`, and `DRAW_KEY_HELP` is the list of them that `MapView` shows as its `keyHelp`. The toolbar's "Add point at map centre" button, and `draw.placeAtCentre()`, add a corner at the centre of the map for anyone who cannot place one by pointing.

The measure of the shape, in the person's units, is in `draw.measure`, and the hook announces changes to screen readers. `ShapesSection` lists the shapes and has the buttons to download them as GeoJSON, CSV or WKT, to copy a link that carries them, and to import a file.

## What you provide

`useDraw` needs the map's adapter, which is why `Chrome` writes `useMap()` into a ref that `getAdapter` reads: the hook lives above `MapView`, and the adapter exists only inside it. The units come from `useSettings`. Export, copy and import use services from `ServicesProvider`: the file saver, the clipboard and the file opener. The fakes in Get started do not write real files; a host that supplies its own adapters does. [Extending MapCairn](../guides/extending.md) lists the ports, the interfaces the SDK defines for what lies outside it.

The reference host's `App.tsx` is the full version, with the tool opened from a button, the sheet shared with other sections, and `Done` returning focus to the button.

## When it goes wrong

- **The list of shapes is empty.** `ShapesSection` says "Nothing drawn yet. Choose Draw shapes on the map to start." The toolbar says "Nothing to export yet. Finish a shape first." when no shape is finished.
- **A shape is not valid.** While a person draws, `draw.issueMessage` says what is wrong and the toolbar shows it, for example "The edges cross each other. Move a point so they do not, then finish." or "Tap a second point to set the circle's radius." A circle's radius is limited to 10,000 km. A shape that is not finished, or not valid, is listed as unfinished and left out of every export.
- **An import file cannot be used.** `draw.importFeedback` holds the outcome. A refusal says why: "The file is empty.", "This is not GeoJSON, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .wkt, .txt or .csv file.", "The WKT could not be read, so none of the file was imported.", or that the file is too large or holds too many shapes or points. A file that is partly usable imports what it can and says what it skipped, such as "2 skipped: 1 with edges that cross, 1 with too few points."
- **Export and import need services you supply.** The fakes in Get started do not save or open real files, so Export gives the person nothing and Import waits for a file that never comes. Provide a `fileSaver`, a `fileOpener` and a clipboard adapter of your own, as [What you provide](#what-you-provide) says.

## Related

- [Extending MapCairn](../guides/extending.md) lists the file and clipboard ports a host supplies.
- [Troubleshooting](../troubleshooting.md) lists the messages from the map when it cannot start.
- [Add a data layer](add-a-layer.md) puts data under the shapes people draw.
