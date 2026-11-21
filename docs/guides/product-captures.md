# The product page's pictures

The product page at `/` shows two real captures of the running playground: the Measure tool over Cape Town in the hero, and Map options on a phone in "What you get". Each is a WebP in `packages/web/src/product/captures`, one for the light theme and one for the dark. They are committed, so the page, the build and CI never fetch a map to show them.

## What is captured

`packages/web/src/product/captureSubjects.ts` is the one table: the view each picture shows, its size in CSS pixels, whether it is a phone, and the basemap of each theme (OpenFreeMap's Bright by day and Fiord by night; never the OpenStreetMap tile layer, whose tile policy rules out scripted capture). The page reads the same table for each image's size, so a picture and its markup cannot differ. The words that describe each picture (alt text, caption) are in `productContent.ts`; the hero's description states the length its line measures, and the script stops if the picture measures something else.

Each picture is taken at the size it is shown at and at twice the device pixels, with motion off, the first-visit tour answered and the credits collapsed. `plateGeometry.ts` works out the latitude and longitude ticks round it from the view, so the collar of the sheet follows the picture.

## Taking them again

Retake the pictures when the interface they show changes visibly, or when you change a subject.

1. Build and serve the e2e bundle on a port of your own: `MAPCAIRN_E2E_PORT=4191 npm run start -w @mapcairn/web`.
2. In another terminal, with the same variable set, run `npm run capture:product -w @mapcairn/web`. Add `-- --only hero` (or `basemaps`) to take one subject.
3. Run `npm run test -w @mapcairn/web` (the capture test checks each file's type, its size, its byte budget and the total), read the pictures, and commit them.
4. Stop the server and check that its port is free.

A normal run contacts nobody. Every request that does not go to the local server is refused, and the basemap's style, tiles, glyphs and sprites are answered from a recording in `packages/web/.captures`, which git ignores, so that megabytes of map data stay out of the repository. The first run on a machine, or one after a view changes, has no recording to replay: run it with `-- --record`, once. That run asks OpenFreeMap for the tiles of each picture, as any visitor's browser would, with Chromium's own user agent, and a person runs it, never CI. Commit only the finished images.

## Weight

The hero's picture is at most 60 KB and the other at most 48 KB, 300 KB for all four files. Only the picture for the visitor's theme is fetched, and only when it nears the screen, so a visit adds about 110 KB. The script encodes WebP with Chromium's own encoder and lowers the quality until a file fits its budget; if even the lowest quality does not, it stops and says by how much, and the fix is a smaller capture or a quieter view, not a larger budget.

## Credits

Every picture shows OpenFreeMap's maps, which carry OpenStreetMap data, so the page shows the map's own credits under it, taken from the basemap definitions in `packages/core/src/basemaps`, and `ATTRIBUTIONS.md` lists the pictures with those credits.
