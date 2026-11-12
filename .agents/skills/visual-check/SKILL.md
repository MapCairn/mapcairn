---
name: visual-check
description: Confirm a MapCairn map or interface change visually. Run the app on its own port, take screenshots at phone, tablet and desktop sizes in light and dark themes over more than one basemap, say what looks wrong or hard to use, fix it, and stop everything started. Use for any change that alters what the app shows, before opening a pull request, and whenever someone asks to look at, screenshot or verify the running app.
---

# Visual check

`AGENTS.md` ("Definition of done") requires this for every map or interface change; tests and linters cannot see that something looks bad or is hard to use. A change with no visible effect says so in its report and skips the rest.

Example: a change moves the layer key. Shoot the map with the key open at 390x844 and 1440x900 in both themes on Bright, then on Satellite at phone size in the dark theme, and note that the key's close button sits under the credits at 390 wide.

## 1. Start the app

1. Install the browsers once if they are missing: `npm run playwright:install -w @mapcairn/web`.
2. Pick a port nobody uses, not 5173 or 4173 (say 5190), and check that nothing listens on it: `Get-NetTCPConnection -LocalPort 5190 -State Listen` on Windows (an error means none), `lsof -nP -iTCP:5190 -sTCP:LISTEN` elsewhere. Another agent may be running a server, so never reuse a port that is taken.
3. Run `npm run dev -w @mapcairn/web -- --port 5190 --strictPort` in the background, so it fails instead of moving to another port. Wait for its ready line, then run the listener check again and write down the PID it shows: the port was free, so that process is yours. Load `http://localhost:5190/` once and let it finish: the first load compiles the app and shows an unstyled page. Development does not apply the production headers; the e2e suite covers those.
4. The map fetches real tiles. If the network is blocked and the map stays blank, say so and judge only the interface around it.

## 2. Take the screenshots

Save every image under `.tmp-visual/` (ignored by git) in a name that says size, theme and basemap, such as `phone-dark-bright.png`.

| Size | Viewport |
| --- | --- |
| Phone | 390x844 |
| Tablet | 820x1180 |
| Desktop | 1440x900 |

- Default basemap: all three sizes in both themes (six images).
- At least one other basemap: Satellite or Topographic, plus Dark, at phone and desktop in the theme where it matters. A basemap is chosen with `&basemap=<id>` in the address hash, for example `http://localhost:5190/#map=10.00/-33.92000/18.42000&basemap=satellite`. The ids the site offers are in `HOST_BASEMAP_IDS` in `packages/web/src/basemaps/hostBasemaps.ts`.
- Put the app in the state the change affects first (open the panel, turn the layer on, start the tool), and show that state, not only the bare map.

If your tool has Playwright browser tools, use them to set the window size and colour scheme, open the address, wait for the map to finish loading and save a screenshot to a named file. Otherwise use the Playwright CLI from the repository root for each combination:

```bash
npx --no-install playwright screenshot --viewport-size=390,844 --color-scheme=dark --wait-for-selector='[data-zoom][aria-busy="false"]' --wait-for-timeout=6000 "http://localhost:5190/#map=10.00/-33.92000/18.42000&basemap=bright" .tmp-visual/phone-dark-bright.png
```

The map is ready when `[data-zoom][aria-busy="false"]` matches; the extra 6 seconds lets the credits, which open for the first five seconds, close. Screenshot them open too if the change touches them. If a state needs clicks, use a short Playwright script in `.tmp-visual/` instead. Read each image; do not assume it is right because it was produced.

## 3. Judge and fix

Look for: overlap or clipping (especially the bottom row at 390 wide), text or icons with weak contrast, touch targets that are too small, controls hidden under the sheet or the credits, a layout that differs between themes, a map that is empty or still loading, and anything that breaks the harmony of the design in `DESIGN.md`. Write down each problem with its image name. Fix what is in scope, take the affected images again, and repeat until none remain. A problem outside the change becomes an issue (`create-issue` skill).

## 4. Clean up and report

1. Stop the dev server and every browser you started, and nothing else. Kill only the process you recorded and its children (`taskkill /PID <pid> /T /F` on Windows, `kill <pid>` and its children elsewhere; `npm` leaves children behind), then re-run the listener check and confirm nothing listens on the port.
2. Check `git status` shows no image; `.tmp-visual/` must stay uncommitted.
3. Report under **Seen** (the report in `AGENTS.md`, "Definition of done"): the sizes, themes and basemaps covered, what looked wrong and what you fixed, and what remains. Give the folder's absolute path. An agent does not attach images (`gh` cannot upload them); the pull request describes in words what was seen, as `land-pr` section 1 says.
