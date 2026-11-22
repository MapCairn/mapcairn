# The product page's pictures

The product page at `/` shows one real capture of the running playground, straight under the hero: the Measure tool over Cape Town, taken at two sizes, a narrow one (`hero`, 400 by 520) drawn edge to edge on a phone and a wide one (`heroWide`, 1152 by 640) drawn from 48rem as wide as the screen allows up to its own width, wider than the text column on a large screen. Each is a WebP in `packages/web/src/product/captures`, one for the light theme and one for the dark. They are committed, so the page, the build and CI never fetch a map to show them.

## What is captured

`packages/web/src/product/captureSubjects.ts` is the one table: the view each picture shows, its size in CSS pixels, whether it is a phone, and the basemap of each theme (OpenFreeMap's Bright by day and Fiord by night; never the OpenStreetMap tile layer, whose tile policy rules out scripted capture). The page reads the same table for each image's size, so a picture and its markup cannot differ. The words that describe each picture (alt text, caption) are in `productContent.ts`; the hero's description states the length its line measures, and the script stops if the picture measures something else.

Before each shot the script reads the view the map reports in its address and the length the line reads, and stops if either differs from the table, so the words cannot describe another picture. A replay that fails (a missing recording, or one made for another view) says to run again once with `--record`.

Each picture is taken at the size it is shown at and at twice the device pixels, with motion off, the first-visit tour answered and the credits collapsed. `captureProjection.ts` works out where the measured line's two ends fall in the picture, so the script taps them as a person would.

## Taking them again

Retake the pictures when the interface they show changes visibly, or when you change a subject.

1. Once on a machine: `npm run playwright:install -w @mapcairn/web`, which installs the browsers the script drives.
2. Build and serve the e2e bundle on a port of your own: `MAPCAIRN_E2E_PORT=4191 npm run start -w @mapcairn/web`.
3. In another terminal, with the same variable set, run `npm run capture:product -w @mapcairn/web`. Add `-- --only hero` (or `heroWide`) to take one subject; `--only` on its own is an error.
4. Run `npm run test -w @mapcairn/web` (the capture test checks each file's type, its size, its byte budget and the total), read the pictures, and commit them.
5. Stop the server and check that its port is free.

A normal run contacts nobody. Every request that does not go to the local server is refused, and the basemap's style, tiles, glyphs and sprites are answered from a recording in `packages/web/.captures`, which git ignores, so that megabytes of map data stay out of the repository. The first run on a machine, or one after a view changes, has no recording to replay: run it with `-- --record`, once. That run asks OpenFreeMap for the tiles of each picture, as any visitor's browser would, with Chromium's own user agent, and a person runs it: it refuses when `CI` is set. Commit only the finished images.

## Weight

The narrow picture is at most 60 KB and the wide one at most 180 KB, 480 KB for all four files. The budgets were raised on 2026-11-21, when the wide picture replaced the basemap picker capture, which was illegible at a phone's width, and again the same day when the wide picture grew from 896 to 1152 px so it can be drawn wider than the text on a large screen: at twice the device pixels it needs the bytes to keep its interface text sharp. Only one file is fetched, the one for the visitor's theme and screen width, and only when it nears the screen, so a visit adds at most 180 KB. The script encodes WebP with Chromium's own encoder and lowers the quality until a file fits its budget; if even the lowest quality does not, it stops and says by how much, and the fix is a smaller capture or a quieter view, not a larger budget.

## The README pictures

`README.md` shows two stills and two GIFs in `docs/images`, one of each for the light theme and one for the dark: `playground-light.png`, `playground-dark.png`, `playground-demo.gif` and `playground-demo-dark.gif`. Unlike the product page's pictures, these are taken from the deployed reference site, because they show the live earthquakes layer, which the offline script cannot. `scripts/captureReadmePictures.mjs` takes them with headless Chromium at 1440 by 900: the Measure tool over Africa at zoom 3.6, with the earthquakes layer on for the past week, the credits open and the first-visit tour answered. The recording searches for a place (`Nairobi`, without choosing a result), turns the layer on in Map options, picks Week, measures the same line and opens the credits. The addresses, sizes and program arguments are in `scripts/readmePictures.mjs`, which a test in `packages/core/src/lint` reads.

A person runs it by hand, because it loads the live site and so asks the layer's provider and the basemap's for data as any visitor's browser does, and the search box asks the place search for suggestions. Run it with `node scripts/captureReadmePictures.mjs --out <folder outside the repository>` (add `--stills` or `--demos` for one kind), once for each retake: it loads the page once for each picture. The recordings need `ffmpeg` and `gifski` on the path; the script records at 1440 by 900 with Playwright, cuts the frames at 10 a second, scales them to 960 by 600 and joins them. Reduce each still to a palette before committing it, so it stays near 100 to 200 KB: `uv run --no-project --with pillow python -I -c "from PIL import Image; Image.open('in.png').convert('RGB').quantize(colors=160, dither=Image.Dither.NONE).save('out.png', optimize=True)"` (fewer colours turn the teal quake markers grey). Read each picture in both themes before committing: the interface icons must be the current ones.

## Credits

Every picture shows OpenFreeMap's maps, which carry OpenStreetMap data, so the page shows the map's own credits under the picture, taken from the basemap definitions in `packages/core/src/basemaps`, and `ATTRIBUTIONS.md` lists the pictures with those credits.
