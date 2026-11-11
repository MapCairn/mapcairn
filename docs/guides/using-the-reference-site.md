# Using the reference site

What the reference host offers for saving the map and for drawing, and how each works from the keyboard and a pointer.

## Search by place name or coordinates

The search box finds a place by name through the geocoder when you press Enter or the Search button. It also takes a pair of coordinates, and answers that one itself, in the browser, with no request to the geocoder: a single result named "Coordinates 26.20410° S, 28.04730° E" that you choose like any other result. It reads:

- decimal degrees, latitude first: `-26.2041, 28.0473` or `-26.2041 28.0473`. Every value needs a decimal point with digits after it, or a degree sign or the word degrees
- hemisphere letters (or the words north, south, east and west) before or after a value, in either order: `26.2041S 28.0473E`, `S26.2041 E28.0473`, `28.0473 E, 26.2041 S`
- degrees, minutes and seconds with the usual symbols or words: `26°12'14.8"S 28°02'50.3"E`, `26 degrees 12 minutes 14.8 seconds south, 28 degrees 2 minutes 50.3 seconds east`

A comma is only ever a separator, never a decimal mark, and a negative sign (hyphen, en dash or Unicode minus) cannot be mixed with a hemisphere letter. A bare whole number is not a coordinate, so `12 34`, `3 4`, `+27 82` and `E1 6` are searched as place names; so are `02-123` and `12-14`, because a minus sign that touches a number before it is not the start of a negative value. Text that is out of range (latitude beyond 90, longitude beyond 180), a lone number such as a postcode, or anything with extra text is treated as a place name and searched as usual. Showing a coordinate result sends nothing to the geocoder, but the map loads tiles for that area as it does for any move. The parser is `parseCoordinates` in `@mapcairn/core`, and `useSearch` uses it, so the Directions panel's place search reads coordinates too.

## Save an image and choose between features

The sheet's "Save image" button saves a PNG of the map with its layers, any drawn shapes and credits, made in the browser from what the map has already loaded. A tap that finds several features opens a list, and the `I` key opens the same list for the centre of the map. Neither needs configuration.

## Draw and export shapes

Choose **Draw shapes** in the control group beside the map. Pick Point, Line, Polygon or Circle, then tap the map to place points, or use **Add point at map centre** (or Space) after panning. A circle takes its centre first and its radius from the second tap. **Finish** (or Enter) closes the shape; a polygon needs three points and no crossing edges. Tap a shape's edge or choose it in the **Shapes** list to edit it: drag a point, drag a small midpoint handle to add one, or select a point with Previous point and Next point and move it with the arrow keys. Undo and Redo cover every edit.

**Shapes and export** opens the list. **Download GeoJSON** and **Download CSV** build a file on your device from the finished shapes (the CSV has `id`, `type`, `area_m2`, `length_m`, the GeoJSON geometry as text, and a circle's `radius_m`, `centre_lng` and `centre_lat`). **Import GeoJSON or CSV** reads a file on your device, nothing is uploaded, and adds its points, lines, polygons and circles to the shapes as one undo step, then fits the map to them. It reads GeoJSON (a collection, a feature or a geometry, with Multi geometries split into one shape each and a polygon's holes left out) and the CSV the export writes, so an exported file comes back as the same shapes. A file of more than 1 MB, 500 shapes or 10,000 points is refused, and a shape with crossing edges, too few points or a position outside the world is skipped; the result says which and how many. Shapes are not stored and are not in the address bar. **Copy link with shapes** copies a link that carries them in a compact encoding of up to 2,000 characters; anyone who opens it sees the shapes, and moving the map in their window drops them from the address. In code, the pure rules are in `packages/core/src/draw`, the state hook is `useDraw`, the toolbar and overlay are `DrawToolbar` and `DrawOverlay` in `@mapcairn/map`, the import is `parseShapeFile` in core with the `FileOpener` port, and a host adds drawing by passing `onDraw` to `EndStack` and `draw` to `SheetContent`.
