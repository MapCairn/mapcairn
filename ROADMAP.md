# Roadmap

_Last reviewed: 2026-11-24. Reviewed every year, and sooner when a decision below changes._

This is what MapCairn intends to do over the next twelve months, and what it will not do. Everything under "Intentions" is a plan or an idea, not a promise and not a delivery date. Nothing in it is built unless a status says so. The project has one volunteer maintainer (see [`GOVERNANCE.md`](.github/GOVERNANCE.md)), so the order can change and some items may not happen. The [open issues](https://github.com/MapCairn/mapcairn/issues) are the detailed plan and hold the current state of each item, and [`docs/plans/`](docs/plans/README.md) holds the written plans for large changes.

## Direction

MapCairn aims to give a team everything it needs to build an industry-grade GIS application or platform. That means capabilities comparable to the established commercial mapping and GIS development kits, delivered as an open-source SDK that is accessible by default, private by design, and built from parts that can each be adopted on their own. The reference site shows the parts working together; it stays small and public, and it does not adopt a capability just because the SDK offers it.

Everything on this roadmap works towards the 1.0.0 release of the SDK packages, and work that 1.0.0 does not need is ranked after it. The packages are on npm at `0.x`, where a minor release may break the public API ([what counts as the public API](https://docs.mapcairn.com/guides/public-api/)). After 1.0.0 a breaking change needs a new major version. 1.0.0 needs:

- **A stable public API.** The ways of using the SDK without React, the selection port and the theming hook are settled, each export tagged `@beta` is stabilised or removed, and every member of the API catalogue has a description.
- **Documentation.** A generated API reference, a getting-started page for each way to use the SDK, and a review of every README as an adopter would read it.
- **Accessibility.** Announcements confirmed with a screen reader, the custom element checked with the main front-end frameworks, and the mobile navigation menu fixed.
- **Privacy and terms.** The credit wording on the reference site matches each provider's terms, and the privacy position in [`PRIVACY.md`](PRIVACY.md) does not change.
- **Assurance.** The packed packages checked as a consumer would use them, including an upgrade from the last published release, and the OpenSSF Best Practices silver badge.

## Priorities

The order the work is done in, as GitHub milestones. A milestone is an outcome a person can name and a release note could carry. Smaller work stays in [GitHub Issues](https://github.com/MapCairn/mapcairn/issues), grouped by milestone. A position is a plan, not a promise. The documentation site shows these lists at `/roadmap/` on the documentation site, with the issue counts of each milestone.

Each item gives its track, milestone, outcome and, where one exists, the tracker issue. **SDK** is what a team needs to build an application on MapCairn; **Site** is what visitors to the reference site see. Now holds at most three milestones and Next at most six; Later has no cap. Now and Next hold what 1.0.0 needs, in the order that lets the public API settle first, and Later holds what waits until after it. [What the SDK has and lacks](https://docs.mapcairn.com/guides/capability-matrix/) is in the capability matrix.

A milestone leaves this list in the pull request that closes its last issue. A new issue takes a milestone when one fits; a new milestone is proposed ranked last in its section until the maintainer moves it. `npm run roadmap:check`, part of `npm run lint`, fails on a missing or duplicate milestone or issue, on a missing section and on too many items in Now or Next, and warns about a closed one: remove it, and update "Last reviewed".

### Now

1. **Site, [Selection](https://github.com/MapCairn/mapcairn/milestone/5) ([#49](https://github.com/MapCairn/mapcairn/issues/49)).** Visitors can select several features on the map and work with the selection. It adds a public port and hook that should be settled before the API is declared stable.
2. **SDK, [Embeddable SDK](https://github.com/MapCairn/mapcairn/milestone/6) ([#51](https://github.com/MapCairn/mapcairn/issues/51)).** A team can embed the map in its own application without copying the reference host. The product page was redesigned under this milestone ([#642](https://github.com/MapCairn/mapcairn/issues/642)): it leads with the playground and answers the licence, the cost and how ready the SDK is in the open. A documentation site, served at `docs.mapcairn.com`, is built under it too ([#199](https://github.com/MapCairn/mapcairn/issues/199), [plan 0017](docs/plans/0017-documentation-site.md)). Next in this milestone is using the SDK without React, either as the headless core and MapLibre adapter packages or through a framework-neutral mount function and a custom element, with each way checked in CI against the packed packages ([#672](https://github.com/MapCairn/mapcairn/issues/672)).
3. **SDK, [API reference and assurance](https://github.com/MapCairn/mapcairn/milestone/8) ([#1](https://github.com/MapCairn/mapcairn/issues/1)).** All six SDK packages are on npm with provenance. The API reference is generated from the packages on the documentation site, with every member described. What is left towards 1.0.0 is the OpenSSF Best Practices silver badge ([#4](https://github.com/MapCairn/mapcairn/issues/4)).

### Next

1. **SDK, [Maintenance](https://github.com/MapCairn/mapcairn/milestone/14) ([#146](https://github.com/MapCairn/mapcairn/issues/146)).** The checks 1.0.0 relies on pass: announcements are confirmed with a screen reader and every member of the public API has a description ([#701](https://github.com/MapCairn/mapcairn/issues/701)). The rest of the milestone is upkeep that is not ranked here.
2. **Site, [Open data layers](https://github.com/MapCairn/mapcairn/milestone/1) ([#657](https://github.com/MapCairn/mapcairn/issues/657)).** The credit wording beside the product page map pictures is checked against the provider terms.

### Later

These wait until after 1.0.0 and are ranked in the order they are meant to be done. Each is meant to be added without a breaking change to the stable API.

- **Site, [Layer controls](https://github.com/MapCairn/mapcairn/milestone/9).** Visitors can order, filter, cluster and explore layers and their features.
- **SDK, [Large data](https://github.com/MapCairn/mapcairn/milestone/10).** The map stays fast on very large layers, with tile archives and measured tile budgets.
- **SDK, [Drawing, styling and geometry](https://github.com/MapCairn/mapcairn/milestone/3).** Draw and edit tools, area and line styling, new layer kinds and geometry helpers.
- **Site, [Output and printing](https://github.com/MapCairn/mapcairn/milestone/11).** Visitors can export the map as an image and print it.
- **SDK, [Host-side services](https://github.com/MapCairn/mapcairn/milestone/12).** A host can add its own search, nearby queries, short links, agent tools and analytics.
- **Site, [Terrain and view](https://github.com/MapCairn/mapcairn/milestone/13).** The map can show terrain and carry its tilt in the shared link.

## Intentions

"Priorities" above says which of these come before 1.0.0. "Proposed" means written down and not started; "in progress" means work has begun and nothing is finished yet. An SDK item does not change the reference site unless the maintainer decides so, in the open, with a plan.

| Theme                    | What it covers                                                                                                                                                           | Status                                                                          | Tracking                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers and data          | Richer filters, selecting several features, a layer key on the map                                                                                                       | proposed, some in progress (selecting several features, a layer key on the map) | [#62](https://github.com/MapCairn/mapcairn/issues/62), [#49](https://github.com/MapCairn/mapcairn/issues/49), [#71](https://github.com/MapCairn/mapcairn/issues/71)                                                                                                                   |
| Shapes and formats       | GPX and KML import, and saving a layer's features as GeoJSON or CSV where the provider allows it                                                                         | proposed                                                                        | [#227](https://github.com/MapCairn/mapcairn/issues/227), [#228](https://github.com/MapCairn/mapcairn/issues/228)                                                                                                                                                                      |
| Output                   | An interface for exporting the map as an image at a requested size and extent, and server-side rendering                                                                 | proposed, some in progress                                                      | [#48](https://github.com/MapCairn/mapcairn/issues/48), [#53](https://github.com/MapCairn/mapcairn/issues/53)                                                                                                                                                                          |
| Embedding                | A prebuilt bundle and custom element for pages without React, a headless route, CI checks for other front-end frameworks, server-rendered pages and hosts behind a login | proposed                                                                        | [#44](https://github.com/MapCairn/mapcairn/issues/44), [#672](https://github.com/MapCairn/mapcairn/issues/672), [#675](https://github.com/MapCairn/mapcairn/issues/675), [#51](https://github.com/MapCairn/mapcairn/issues/51), [#45](https://github.com/MapCairn/mapcairn/issues/45) |
| Hosts and agents         | A tool catalogue so an AI agent can drive the map, and an optional analytics sink                                                                                        | proposed                                                                        | [#56](https://github.com/MapCairn/mapcairn/issues/56), [#75](https://github.com/MapCairn/mapcairn/issues/75)                                                                                                                                                                          |
| Code health              | A smaller app hook                                                                                                                                                       | proposed                                                                        | [#25](https://github.com/MapCairn/mapcairn/issues/25)                                                                                                                                                                                                                                 |
| Publishing and assurance | The OpenSSF Best Practices silver badge                                                                                                                                  | in progress                                                                     | [#4](https://github.com/MapCairn/mapcairn/issues/4)                                                                                                                                                                                                                                   |

Further items, such as new open data layers, are added as plans or issues when someone proposes them, and each new dataset is a separate, explicitly scoped decision with its provenance, publication rights and privacy reviewed first (see [`CONTRIBUTING.md`](.github/CONTRIBUTING.md)).

Still wanted and not yet possible: a second trusted person with access, so the project can continue if the maintainer is unavailable. See [`GOVERNANCE.md`](.github/GOVERNANCE.md).

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
