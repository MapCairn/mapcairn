# Roadmap

_Last reviewed: 2026-11-19. Reviewed every year, and sooner when a decision below changes._

This is what MapCairn intends to do over the next twelve months, and what it will not do. Everything under "Intentions" is a plan or an idea, not a promise and not a delivery date. Nothing in it is built unless a status says so. The project has one volunteer maintainer (see [`GOVERNANCE.md`](GOVERNANCE.md)), so the order can change and some items may not happen. The [open issues](https://github.com/MapCairn/mapcairn/issues) are the detailed plan and hold the current state of each item, and [`docs/plans/`](docs/plans/README.md) holds the written plans for large changes.

## Direction

MapCairn aims to give a team everything it needs to build an industry-grade GIS application or platform. That means capabilities comparable to the established commercial mapping and GIS development kits, delivered as an open-source SDK that is accessible by default, private by design, and built from parts that can each be adopted on their own. The reference site shows the parts working together; it stays small and public, and it does not adopt a capability just because the SDK offers it.

## Priorities

The order the work is done in, as GitHub milestones. A milestone is an outcome a person can name and a release note could carry. Everything smaller stays in [GitHub Issues](https://github.com/MapCairn/mapcairn/issues), grouped by its milestone, and is not listed here, so this list does not change when an issue is filed or closed and does not repeat status. A position is a plan, not a promise.

Each item gives the track, the milestone, the outcome and, where one exists, the tracker issue that defines it. **SDK** is the goal in "Direction": what a team needs to build an application on MapCairn. **Site** is what visitors to the reference site see. Now holds at most three milestones and Next at most six; Later holds milestones only and has no cap. The order was set on 2026-11-14 by weighing three things: finish what is half built, open the way for other teams to embed the map early, and do the work that touches every component (language support) while the code base is young. The capability matrix, [`docs/guides/capability-matrix.md`](docs/guides/capability-matrix.md), says what each milestone adds.

A milestone leaves this list in the pull request that closes its last issue. A new issue takes a milestone when one fits; only a new milestone is proposed for this list, ranked last in its section until the maintainer moves it. `npm run roadmap:check`, which `npm run lint` runs, fails on a linked milestone or issue that does not exist or is listed twice, on more than three items in Now or six in Next and on a missing section, and warns about a closed one: remove it, and update "Last reviewed" when you do.

### Now

1. **Site, [Selection](https://github.com/MapCairn/mapcairn/milestone/5) ([#49](https://github.com/MapCairn/mapcairn/issues/49)).** Visitors can select several features on the map and work with the selection.
2. **SDK, [Embeddable SDK](https://github.com/MapCairn/mapcairn/milestone/6) ([#51](https://github.com/MapCairn/mapcairn/issues/51)).** A team can embed the map in its own application without copying the reference host.

### Next

1. **SDK, [First release](https://github.com/MapCairn/mapcairn/milestone/8) ([#1](https://github.com/MapCairn/mapcairn/issues/1)).** The SDK packages are versioned, documented and published, once the project has its own domain names.
2. **Site, [Layer controls](https://github.com/MapCairn/mapcairn/milestone/9).** Visitors can order, filter, cluster and explore layers and their features.

### Later

- **SDK, [Large data](https://github.com/MapCairn/mapcairn/milestone/10).** The map stays fast on very large layers, with tile archives and measured tile budgets.
- **SDK, [Drawing, styling and geometry](https://github.com/MapCairn/mapcairn/milestone/3).** Draw and edit tools, area and line styling, new layer kinds and geometry helpers.
- **Site, [Output and printing](https://github.com/MapCairn/mapcairn/milestone/11).** Visitors can export the map as an image and print it.
- **SDK, [Host-side services](https://github.com/MapCairn/mapcairn/milestone/12).** A host can add its own search, nearby queries, short links, agent tools and analytics.
- **Site, [Terrain and view](https://github.com/MapCairn/mapcairn/milestone/13).** The map can show terrain and carry its tilt in the shared link.

## Intentions

What an industry-grade application needs, and what MapCairn has, partly has or lacks today, is in the [capability matrix](docs/guides/capability-matrix.md).

Statuses are "proposed" (written down, not started) and "in progress" (work has begun, nothing finished that you can rely on). Items for the SDK do not change the reference site unless the maintainer decides so, in the open, with a plan.

| Theme                    | What it covers                                                                                                                                                           | Status                                                                                                               | Tracking                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers and data          | A layer catalogue loaded at runtime per user, richer filters and layers that wait for a filter, selecting several features, a layer key on the map, clearer layer status | proposed, some in progress (a layer catalogue loaded at runtime, selecting several features, a layer key on the map) | [#62](https://github.com/MapCairn/mapcairn/issues/62), [#49](https://github.com/MapCairn/mapcairn/issues/49), [#71](https://github.com/MapCairn/mapcairn/issues/71)                                                        |
| Shapes and formats       | Reading and writing more geometry formats                                                                                                                                | in progress                                                                                                          | [#50](https://github.com/MapCairn/mapcairn/issues/50)                                                                                                                                                                      |
| Map interface            | Showing the zoom level beside the cursor coordinates                                                                                                                     | in progress                                                                                                          | [#61](https://github.com/MapCairn/mapcairn/issues/61)                                                                                                                                                                      |
| Output                   | Exporting the map as an image at a requested size and extent, and server-side rendering for hosts that want it                                                           | proposed, some in progress                                                                                           | [#48](https://github.com/MapCairn/mapcairn/issues/48), [#53](https://github.com/MapCairn/mapcairn/issues/53)                                                                                                               |
| Embedding                | An optional MapLibre adapter package, a prebuilt bundle for pages without React, making the SDK easy to add to server-rendered applications, and hosts behind a login    | proposed                                                                                                             | [#43](https://github.com/MapCairn/mapcairn/issues/43), [#44](https://github.com/MapCairn/mapcairn/issues/44), [#51](https://github.com/MapCairn/mapcairn/issues/51), [#45](https://github.com/MapCairn/mapcairn/issues/45) |
| Hosts and agents         | A tool catalogue so an AI agent can drive the map, and an optional analytics sink hosts can plug their own tools into                                                    | proposed                                                                                                             | [#56](https://github.com/MapCairn/mapcairn/issues/56), [#75](https://github.com/MapCairn/mapcairn/issues/75)                                                                                                               |
| Code health              | Smaller modules in the map adapter, the layer hook and the app hook                                                                                                      | proposed, some in progress                                                                                           | [#24](https://github.com/MapCairn/mapcairn/issues/24), [#25](https://github.com/MapCairn/mapcairn/issues/25), [#26](https://github.com/MapCairn/mapcairn/issues/26)                                                        |
| Publishing and assurance | Getting the SDK packages ready to publish to npm with generated API documentation, and working toward the OpenSSF Best Practices silver badge                            | in progress (#4), proposed (#1)                                                                                      | [#1](https://github.com/MapCairn/mapcairn/issues/1), [#4](https://github.com/MapCairn/mapcairn/issues/4)                                                                                                                   |

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

The reference site no longer offers a Satellite basemap. The imagery it used was licensed for non-commercial use only, and imagery whose terms allow commercial use is needed before one returns ([#13](https://github.com/MapCairn/mapcairn/issues/13), [#258](https://github.com/MapCairn/mapcairn/issues/258)). It no longer offers a Topographic basemap either: its provider is a volunteer-run project that gives no availability guarantee ([#258](https://github.com/MapCairn/mapcairn/issues/258)).
