# Attributions

The reference host bundles no datasets. Its basemaps use third-party map services.

## Basemaps

| Source | Use | Credit |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org) | Positron, Liberty and Dark vector styles and tiles | OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors |
| Esri | Topographic tiles | © Esri, HERE, Garmin, USGS and the GIS User Community |
| Esri | Satellite imagery | © Esri, Maxar, Earthstar Geographics |

OpenStreetMap data is available under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/). The map displays the active provider's attribution.

### Basemap previews

The basemap picker previews in `packages/web/public/basemaps/` are small screenshots of central Cape Town, taken from the live services with `scripts/generateBasemapThumbnails.mjs`. They carry the same credits as the maps they show:

| Preview | Source | Credit |
|---|---|---|
| `positron.jpg`, `liberty.jpg`, `dark.jpg` | OpenFreeMap vector tiles and styles | © OpenMapTiles, Data from OpenStreetMap (© OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)), OpenFreeMap |
| `satellite.jpg` | Esri World Imagery | Tiles © Esri, Maxar, Earthstar Geographics |
| `topo.jpg` | Esri World Topographic Map | Tiles © Esri: Esri, HERE, Garmin, and the GIS User Community |

OpenFreeMap asks for this attribution wherever its maps appear in images or other media. Regenerate the previews with the script rather than editing them by hand, and keep this table in step with the basemap registry in `packages/core/src/basemaps`.

## Place search

Place search and reverse geocoding use [OpenStreetMap Nominatim](https://nominatim.org), with © OpenStreetMap contributors attribution.

## Software

The Karta SDK packages (`core`, `map`, `react` and `theme`) are licensed under [Apache-2.0](packages/core/LICENSE). The reference host in `packages/web` is licensed under [AGPL-3.0](LICENSE). Dependency licences are recorded in the installed packages' licence files.

Public Sans and Source Serif 4 are self-hosted under the SIL Open Font License 1.1.
