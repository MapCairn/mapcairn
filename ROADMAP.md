# Roadmap

_Last reviewed: 2026-11-14. Reviewed every year, and sooner when a decision below changes._

This is what MapCairn intends to do over the next twelve months, and what it will not do. Everything under "Intentions" is a plan or an idea, not a promise and not a delivery date. Nothing in it is built unless a status says so. The project has one volunteer maintainer (see [`GOVERNANCE.md`](GOVERNANCE.md)), so the order can change and some items may not happen. The [open issues](https://github.com/MapCairn/mapcairn/issues) are the detailed plan and hold the current state of each item, and [`docs/plans/`](docs/plans/README.md) holds the written plans for large changes.

## Direction

MapCairn aims to give a team everything it needs to build an industry-grade GIS application or platform. That means capabilities comparable to the established commercial mapping and GIS development kits, delivered as an open-source SDK that is accessible by default, private by design, and built from parts that can each be adopted on their own. The reference site shows the parts working together; it stays small and public, and it does not adopt a capability just because the SDK offers it.

## Priorities

The order the work is done in, as issue numbers with the reason for each position. The issue holds the current state; this list holds the order only, so it does not repeat status. A position is a plan, not a promise.

Two tracks share the list. **SDK** is the goal in "Direction": what a team needs to build an application on MapCairn. **Site** is what visitors to the reference site see. Now holds at most five items, and every second item in Now and Next is a Site item, so the site keeps improving while the SDK grows. The order was set on 2026-11-14 by weighing three things: finish what is half built, open the way for other teams to embed the map early, and do the work that touches every component (language support) while the code base is young. The capability matrix, [`docs/guides/capability-matrix.md`](docs/guides/capability-matrix.md), says what each item adds. `npm run roadmap:check`, which `npm run lint` runs, fails on an issue number that does not exist or is listed twice, on more than five items in Now and on a missing section, and warns about a closed issue: move or remove it, and update "Last reviewed" when you do.

### Now

1. **SDK, #231.** Language support: a plan first, then a small slice (the catalogue port, the English text and one panel). It touches the copy of almost every component, so it is cheapest now, and it brings Afrikaans to the reference site.
2. **Site, #117, #118 and #119.** Highlight selected features, the Selection panel and select mode. The selection port and hook are built, and nothing in the interface uses them yet.
3. **SDK, #24 and then #43.** The engine adapter in its own package. It is the first step for a team that wants to embed the map without copying the reference host.
4. **Site, #126 and #127.** Identify on raster layers: the tap, the key press and the guide. The core is built.
5. **SDK, #198.** A small check that every SDK dependency allows commercial use, in place before packages are published.

### Next

1. **SDK, #44.** A mount function and a prebuilt bundle for pages without React, the main path for existing server-rendered applications.
2. **Site, #176.** Order and opacity for every layer.
3. **SDK, #45.** Hosts that sit behind a login.
4. **Site, #121 and #122.** Finish selection: the features inside a drawn shape, and dropping references when a layer leaves.
5. **SDK, #195.** One place for tile and layer requests (limits, retry, a hook for credentials and headers).
6. **Site, #175.** A command palette.
7. **SDK, #220.** A host can theme the SDK, with contrast checked.
8. **Site, #183.** Clustering for dense point layers.
9. **SDK, #230 and #221.** The guide to the Content Security Policy a host needs, and the guide to serving the bundle from a Windows web server and server-rendered pages.
10. **Site, #71 and #213.** Finish the map key, and stop the credits popover jumping.
11. **SDK, #232 and #184.** Two small guides: open service standards, and a custom search provider.
12. **Site, #229.** Say once when the device is offline.
13. **SDK, #192, #194 and #193.** The large-data track: tile archives, a tile budget, and cards for vector features.
14. **Site, #179.** A side panel with a feature's full details.

### Later

After the project has its own domain names, in this order:

1. **SDK, #199.** The documentation site.
2. **SDK, #174.** Component documentation.
3. **SDK, #1.** Versioning, GitHub releases and npm, with API documentation. The dependency check in Now is already in place by then.

Then, roughly in this order:

- **Small additions:** #222 (UTM and MGRS), #225 (snapping), #226 (buffer and merge), #227 (GPX and KML), #62 (richer filters), #48 (the interface for image export) and #178 (printing), #182 (a timeline), #181 and #180 (box and lasso selection, elevation profile), #228 (save a layer's features), #84 (WKT axis order), #79 (the zoom level in a layer's message).
- **Research and plans, each to be decided after its measurement or plan:** #223 (coordinate systems), #224 (terrain), #177 (tilt and the shared link), #185 (deck.gl), #196 (storing tiles on the device), #197 (MapLibre Tile), #186, #187 and #188 (host-side search, nearby queries and short links), #53 (server rendering), #56 and #75 (an agent tool catalogue and an analytics sink).
- **Whenever there is room (quality and process):** #210 (Biome), #89 (refs in render), #25 (thin the app hook), #214, #218 and #149 (test stability and shard balance), #216, #215 and #217 (documents and CI security), #146 (a screen reader check, which needs a person with a screen reader), #4 (the OpenSSF silver badge) and the agent and skill upkeep in #82, #93 and #108.
- **Trackers, not ranked:** #47, #49 and #51 (their steps are ranked above), and #191, which keeps this list.

## Intentions

What an industry-grade application needs, and what MapCairn has, partly has or lacks today, is in the [capability matrix](docs/guides/capability-matrix.md).

Statuses are "proposed" (written down, not started) and "in progress" (work has begun, nothing finished that you can rely on). Items for the SDK do not change the reference site unless the maintainer decides so, in the open, with a plan.

| Theme | What it covers | Status | Tracking |
| --- | --- | --- | --- |
| Layers and data | A layer catalogue loaded at runtime per user, identifying features on raster tile layers, richer filters and layers that wait for a filter, selecting several features, a layer key on the map, clearer layer status | proposed, some in progress (a layer catalogue loaded at runtime, identifying features on raster tile layers, selecting several features, a layer key on the map) | [#46](https://github.com/MapCairn/mapcairn/issues/46), [#47](https://github.com/MapCairn/mapcairn/issues/47), [#62](https://github.com/MapCairn/mapcairn/issues/62), [#49](https://github.com/MapCairn/mapcairn/issues/49), [#71](https://github.com/MapCairn/mapcairn/issues/71), [#66](https://github.com/MapCairn/mapcairn/issues/66) |
| Shapes and formats | Reading and writing more geometry formats | in progress | [#50](https://github.com/MapCairn/mapcairn/issues/50) |
| Map interface | Showing the zoom level beside the cursor coordinates | in progress | [#61](https://github.com/MapCairn/mapcairn/issues/61) |
| Output | Exporting the map as an image at a requested size and extent, and server-side rendering for hosts that want it | proposed, some in progress | [#48](https://github.com/MapCairn/mapcairn/issues/48), [#53](https://github.com/MapCairn/mapcairn/issues/53) |
| Embedding | An optional MapLibre adapter package, a prebuilt bundle for pages without React, making the SDK easy to add to server-rendered applications, and hosts behind a login | proposed | [#43](https://github.com/MapCairn/mapcairn/issues/43), [#44](https://github.com/MapCairn/mapcairn/issues/44), [#51](https://github.com/MapCairn/mapcairn/issues/51), [#45](https://github.com/MapCairn/mapcairn/issues/45) |
| Hosts and agents | A tool catalogue so an AI agent can drive the map, and an optional analytics sink hosts can plug their own tools into | proposed | [#56](https://github.com/MapCairn/mapcairn/issues/56), [#75](https://github.com/MapCairn/mapcairn/issues/75) |
| Code health | Smaller modules in the map adapter, the layer hook and the app hook | proposed, some in progress | [#24](https://github.com/MapCairn/mapcairn/issues/24), [#25](https://github.com/MapCairn/mapcairn/issues/25), [#26](https://github.com/MapCairn/mapcairn/issues/26) |
| Publishing and assurance | Getting the four SDK packages ready to publish to npm with generated API documentation, and working toward the OpenSSF Best Practices silver badge | in progress (#4), proposed (#1) | [#1](https://github.com/MapCairn/mapcairn/issues/1), [#4](https://github.com/MapCairn/mapcairn/issues/4) |

Further items, such as new open data layers, are added as plans or issues when someone proposes them, and each new dataset is a separate, explicitly scoped decision with its provenance, publication rights and privacy reviewed first (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

Still wanted and not yet possible: a second trusted person with access, so the project can continue if the maintainer is unavailable. See [`GOVERNANCE.md`](GOVERNANCE.md).

## Non-goals

The project does not intend to do these, and a pull request that does one will be declined. They describe the reference site and its Worker. An SDK item above may let a host do something the reference site will not, and the reference site does not adopt it without a decision from the maintainer, made in the open.

- **Accounts.** There is no sign-in, no profile and no stored user data on a server.
- **Tracking.** There is no tracking beyond cookieless page-view counts. No advertising, no fingerprinting and no cross-site identifiers, and no counting of feature use on the reference site ([#41](https://github.com/MapCairn/mapcairn/issues/41), closed as not planned). SDK hosts can plug in their own analytics through the optional sink in [#75](https://github.com/MapCairn/mapcairn/issues/75).
- **Bundled datasets.** The reference site ships no data of its own. A layer is a definition that points to a public provider, and the visitor's browser fetches it only after the visitor turns it on. Household-level or identifying data is never published.
- **Another map engine.** MapLibre GL JS is the only engine. The interface depends on a port, so tests can use a fake, but no second engine is planned.
- **Google Maps Platform adapters.** Optional adapters for Google's search, routing and tile services were planned and dropped ([#40](https://github.com/MapCairn/mapcairn/issues/40), closed as not planned): Google's current terms appear to restrict the content of Places, Geocoding and Routes from use with a non-Google map. A host that wants them can write its own adapters against the existing ports.
- **Proxying layers.** The Worker does not fetch, cache or relay layer data, tiles, search or routing on behalf of visitors. Browsers talk to the providers directly.
- **Live refresh of layers.** A layer loads when it is turned on, when its controls change or, for a layer that asks only for the view, when the map moves to a new area. It never refreshes on a timer or polls, because the providers are public services that nobody pays for, and polling from every open tab would load them for no gain.

A satellite basemap was a non-goal until 2026-11-11. It was dropped because a keyless source whose terms allow a public, non-commercial site was confirmed (EOX Sentinel-2 cloudless, CC BY-NC-SA 4.0), so the reference site now offers Satellite, defined in the host. The SDK still carries no satellite source, because that licence is non-commercial ([#13](https://github.com/MapCairn/mapcairn/issues/13)).
