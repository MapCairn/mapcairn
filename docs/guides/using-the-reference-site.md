# Using the reference site

What the reference host offers for saving the map and for drawing, and how each works from the keyboard and a pointer.

## Save an image and choose between features

The sheet's "Save image" button saves a PNG of the map with its layers, any drawn shapes and credits, made in the browser from what the map has already loaded. A tap that finds several features opens a list, and the `I` key opens the same list for the centre of the map. Neither needs configuration.

## Draw and export shapes

Choose **Draw shapes** in the control group beside the map. Pick Point, Line, Polygon or Circle, then tap the map to place points, or use **Add point at map centre** (or Space) after panning. A circle takes its centre first and its radius from the second tap. **Finish** (or Enter) closes the shape; a polygon needs three points and no crossing edges. Tap a shape's edge or choose it in the **Shapes** list to edit it: drag a point, drag a small midpoint handle to add one, or select a point with Previous point and Next point and move it with the arrow keys. Undo and Redo cover every edit.

**Shapes and export** opens the list. **Download GeoJSON** and **Download CSV** build a file on your device from the finished shapes (the CSV has `id`, `type`, `area_m2`, `length_m` and the GeoJSON geometry as text). Shapes are not stored and are not in the address bar. **Copy link with shapes** copies a link that carries them in a compact encoding of up to 2,000 characters; anyone who opens it sees the shapes, and moving the map in their window drops them from the address. In code, the pure rules are in `packages/core/src/draw`, the state hook is `useDraw`, the toolbar and overlay are `DrawToolbar` and `DrawOverlay` in `@mapcairn/map`, and a host adds drawing by passing `onDraw` to `EndStack` and `draw` to `SheetContent`.
