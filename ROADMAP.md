# Roadmap

_Last reviewed: 2026-11-11. Reviewed every year, and sooner when a decision below changes._

This is what MapCairn intends to do over the next twelve months, and what it will not do. Everything under "Intentions" is a plan or an idea, not a promise and not a delivery date. Nothing in it is built unless a status says so. The project has one volunteer maintainer (see [`GOVERNANCE.md`](GOVERNANCE.md)), so the order can change and some items may not happen. The tracking issue for each item holds the current state, and [`docs/plans/`](docs/plans/README.md) holds the written plans.

## Intentions

Statuses are "proposed" (written down, not started) and "in progress" (work has begun, nothing finished that you can rely on).

| Intention | Status | Tracking |
| --- | --- | --- |
| Rename the project from Karta to MapCairn everywhere, and keep the old address working by redirecting it | in progress | [#170](https://github.com/MapCairn/mapcairn/issues/170) |
| Work toward the OpenSSF Best Practices silver badge: governance, this roadmap, an assurance case, a vulnerability response process, code style and review documents, and a repeatable build | in progress | [#182](https://github.com/MapCairn/mapcairn/issues/182) |
| A basemap set of six in an even grid of three by two, each defined as data, all free for commercial use | proposed | [#184](https://github.com/MapCairn/mapcairn/issues/184) |
| Fix chrome legibility (scale, credits button and markers) over basemaps with dark or busy backgrounds, in both themes | proposed | [#186](https://github.com/MapCairn/mapcairn/issues/186) |
| A faint MapCairn mark and name on the map, decorative only | proposed | [#176](https://github.com/MapCairn/mapcairn/issues/176) |
| A skippable first-visit tour, replaceable by the host (plan 0004) | proposed | [#179](https://github.com/MapCairn/mapcairn/issues/179) |
| Get the four SDK packages ready to publish to npm, with API documentation generated from the TSDoc comments. A plan comes first | proposed | [#165](https://github.com/MapCairn/mapcairn/issues/165) |
| A globe view alongside the flat map. It starts after the rename, the tour and the basemap set, and a plan comes first | proposed | [#187](https://github.com/MapCairn/mapcairn/issues/187) |
| A 30-minute rainfall product, which needs a time-of-day control in the layer system. Low priority | proposed | [#173](https://github.com/MapCairn/mapcairn/issues/173) |
| Redraw the icon masters in `packages/web/scripts/icons` as the cairn mark, so regenerating the icons does not bring back the old pin | proposed | [#191](https://github.com/MapCairn/mapcairn/issues/191) |

Further items, such as new open data layers, are added as plans or issues when someone proposes them, and each new dataset is a separate, explicitly scoped decision with its provenance, publication rights and privacy reviewed first (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

Still wanted and not yet possible: a second trusted person with access, so the project can continue if the maintainer is unavailable. See [`GOVERNANCE.md`](GOVERNANCE.md).

## Non-goals

The project does not intend to do these, and a pull request that does one will be declined.

- **Accounts.** There is no sign-in, no profile and no stored user data on a server.
- **Tracking.** There is no tracking beyond cookieless page-view counts. No advertising, no fingerprinting and no cross-site identifiers.
- **Bundled datasets.** The reference site ships no data of its own. A layer is a definition that points to a public provider, and the visitor's browser fetches it only after the visitor turns it on. Household-level or identifying data is never published.
- **Another map engine.** MapLibre GL JS is the only engine. The interface depends on a port, so tests can use a fake, but no second engine is planned.
- **Proxying layers.** The Worker does not fetch, cache or relay layer data, tiles, search or routing on behalf of visitors. Browsers talk to the providers directly.
- **Live refresh of layers.** A layer loads when it is turned on, when its controls change or, for a layer that asks only for the view, when the map moves to a new area. It never refreshes on a timer or polls, because the providers are public services that nobody pays for, and polling from every open tab would load them for no gain.
- **A satellite basemap.** No satellite or aerial imagery is offered as a basemap. Layers that show satellite-derived products, such as imagery or rainfall, are separate, optional layers and are not affected.
