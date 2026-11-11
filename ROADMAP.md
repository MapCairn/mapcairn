# Roadmap

_Last reviewed: 2026-11-11. Reviewed every year, and sooner when a decision below changes._

This is what MapCairn intends to do over the next twelve months, and what it will not do. Everything under "Intentions" is a plan or an idea, not a promise and not a delivery date. Nothing in it is built unless a status says so. The project has one volunteer maintainer (see [`GOVERNANCE.md`](GOVERNANCE.md)), so the order can change and some items may not happen. The tracking issue for each item holds the current state, and [`docs/plans/`](docs/plans/README.md) holds the written plans.

## Intentions

Statuses are "proposed" (written down, not started) and "in progress" (work has begun, nothing finished that you can rely on).

| Intention | Status | Tracking |
| --- | --- | --- |
| Work toward the OpenSSF Best Practices silver badge: governance, this roadmap, an assurance case, a vulnerability response process, code style and review documents, and a repeatable build | in progress | [#4](https://github.com/MapCairn/mapcairn/issues/4) |
| Get the four SDK packages ready to publish to npm, with API documentation generated from the TSDoc comments. A plan comes first | proposed | [#1](https://github.com/MapCairn/mapcairn/issues/1) |
| A 30-minute rainfall product, which needs a time-of-day control in the layer system. Low priority | proposed | [#2](https://github.com/MapCairn/mapcairn/issues/2) |

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

A satellite basemap was a non-goal until 2026-11-11. It was dropped because a keyless source whose terms allow a public, non-commercial site was confirmed (EOX Sentinel-2 cloudless, CC BY-NC-SA 4.0), so the reference site now offers Satellite, defined in the host. The SDK still carries no satellite source, because that licence is non-commercial ([#13](https://github.com/MapCairn/mapcairn/issues/13)).
