# Attributions

The reference host bundles no datasets. Its basemaps and its open data layers use third-party services, fetched by the browser only when someone turns a layer on.

## Open data layers

Each layer's definition in `packages/web/src/layers/definitions/` carries the credit below, and the map credits show it while the layer is on. A test fails if a definition's credit is missing here.

| Layer | Source | Credit |
|---|---|---|
| Earthquakes | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/) GeoJSON feeds, US public domain | Credit: U.S. Geological Survey |
| Fire, flood, tropical cyclone, volcano and drought alerts | [GDACS](https://www.gdacs.org/) event feed, a joint initiative of the United Nations and the European Commission, under CC BY 4.0 | Global Disaster Alert and Coordination System, GDACS |
| Flood hazard map | [GloFAS](https://www.globalfloods.eu/), Copernicus Emergency Management Service, `FloodHazard100y` | Generated using Copernicus Emergency Management Service information {year} |
| Earth at night | [NASA Black Marble](https://blackmarble.gsfc.nasa.gov/) VIIRS night lights, a 2016 annual composite served by GIBS | VIIRS Black Marble night lights, NASA Earth Observatory |
| Where people live | [GPWv4](https://sedac.ciesin.columbia.edu/data/collection/gpw-v4) population density for 2020, NASA SEDAC, served by GIBS, under CC BY 4.0 | Center for International Earth Science Information Network (CIESIN), Columbia University: Gridded Population of the World, Version 4 (GPWv4), NASA SEDAC |
| Sea temperature compared with normal | [GHRSST MUR](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1) sea surface temperature anomalies, NASA JPL PO.DAAC, served by GIBS | GHRSST Level 4 MUR sea surface temperature analysis, NASA JPL PO.DAAC |
| Countries by population | [Natural Earth](https://www.naturalearthdata.com/) 1:110m country boundaries, public domain, served by the jsDelivr content delivery network | Made with Natural Earth |
| Fire hotspots | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api), MODIS Terra and VIIRS NOAA-21 thermal anomalies | We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS). |
| Satellite imagery | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api), VIIRS NOAA-21 corrected reflectance | We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS). |
| Rainfall | [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg) daily precipitation rate, served by GIBS (a daily image NASA makes from the 30-minute IMERG data: the newest days come from the [Early run](https://doi.org/10.5067/GPM/IMERG/3B-HH-E/07) and are replaced by the [Final run](https://doi.org/10.5067/GPM/IMERG/3B-HH/07) when it is ready, about four months later) | GPM IMERG precipitation, Huffman, G. J., Stocker, E. F., Bolvin, D. T., Nelkin, E. J., Tan, J., NASA GES DISC |

NASA data is openly shared; its data use guidance says NASA material may not be used to suggest or imply endorsement by NASA, and the app uses no NASA logo. The GIBS acknowledgement is the full wording from the GIBS "Data Use Guidance and Acknowledgements" page. GDACS alerts are automatic model outputs and the app says so on every card. The Copernicus CEMS-FLOODS licence asks for "Generated using Copernicus Emergency Management Service information [Year]" and says the data is for information only. In the definition `{year}` stands for the current year, filled in when the credit is shown; confirm both texts on the current licence pages before release.

## Basemaps

| Source | Use | Credit |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org) | Liberty and Positron vector styles and tiles | OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors |
| [OpenStreetMap](https://www.openstreetmap.org) | Streets raster tiles from `tile.openstreetmap.org` | © OpenStreetMap contributors, linked to [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright) |
| [Maptoolkit](https://www.maptoolkit.org/) | Maptoolkit Dark vector style and tiles from `styles.maptoolkit.org`, `tiles.maptoolkit.org`, `icons.maptoolkit.org` and `fonts.maptoolkit.org`, with terrain tiles from `tiles.mapterhorn.com` that its style names | The Maptoolkit logo and "© Maptoolkit © Openstreetmap", always on screen while it is shown (see below) |

OpenStreetMap data is available under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/). Use of the OpenStreetMap tile servers follows the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). The map displays the active provider's attribution, followed by MapLibre's.

### Maptoolkit Dark

Maptoolkit Dark is served from the Maptoolkit community tile server under the [Maptoolkit Community License](https://www.maptoolkit.org/tos). Its definition lives in the reference host (`packages/web/src/basemaps`), not in the reusable SDK packages, because the licence is the host's to accept. The licence sets conditions that the host meets:

- Section 8, attribution: while the basemap is shown or loading, the Maptoolkit logo (at least 24 CSS pixels high, linked to `https://www.maptoolkit.org/`) and "© Maptoolkit © Openstreetmap" (linked to `https://www.maptoolkit.com/copyright/` and `https://www.openstreetmap.org/copyright`) stay on screen, never collapsed, hidden or covered. The other basemaps keep their collapsing credits.
- Section 7, no static exports: Save image is off while the basemap is shown or loading, with the reason in the Save image section, and the map adapter refuses to make an image of it. The picker therefore shows a plain swatch for it, not a preview image.
- Section 11, styles stay Maptoolkit's: the style is loaded from Maptoolkit's own address and is not copied into this repository. `packages/web/src/basemaps/fixtures/maptoolkit-dark-requests.json` records only the addresses it requests, so a test can check each against the production Content Security Policy.
- Section 9, fair use: unregistered use is limited to 10 uncached requests a second. Nothing here registers or sends a key.

The logo is `packages/web/public/basemaps/maptoolkit-logo.svg`, the artwork of `@maptoolkit/maplibre-logo-control` 1.1.2 (the logo control Maptoolkit publishes on [GitHub](https://github.com/maptoolkit/maplibre-logo-control)), copied unchanged with a title element added. That package is licensed under BSD-3-Clause, Copyright (c) 2026, Maptoolkit - Toursprung GmbH. The full licence text is in `packages/web/public/basemaps/maptoolkit-logo.LICENSE.txt`, served beside the logo, and the SVG carries a one-line notice. The [licence](https://github.com/maptoolkit/maplibre-logo-control/blob/HEAD/LICENSE) requires redistributions to retain the copyright notice, the conditions and the disclaimer, and does not allow the name Maptoolkit to be used to endorse this project without permission. Karta is not endorsed by Maptoolkit.

### Basemap previews

The basemap picker previews in `packages/web/public/basemaps/` are small images of the Cape Town Waterfront, rendered with MapLibre GL JS from the providers' own tiles by `scripts/generateBasemapThumbnails.mjs`. They carry the same credits as the maps they show:

| Preview | Source | Credit |
|---|---|---|
| `liberty.jpg`, `positron.jpg` | OpenFreeMap vector tiles and styles | © OpenMapTiles, Data from OpenStreetMap (© OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)), OpenFreeMap |
| `osm.jpg` | OpenStreetMap standard tiles | © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/) |

OpenFreeMap asks for this attribution wherever its maps appear in images or other media. Regenerate the previews with the script rather than editing them by hand, and keep this table in step with the basemap definitions in `packages/core/src/basemaps` and `packages/web/src/basemaps`. Maptoolkit Dark has no preview, for the reason above.

The social preview image (`packages/web/public/og-image.png`) is generated by `packages/web/scripts/generateOgImage.ts`.

## Place search

Place search and reverse geocoding use [OpenStreetMap Nominatim](https://nominatim.org), with © OpenStreetMap contributors attribution.

## Routing

Routes and travel-time areas come from the public [Valhalla](https://valhalla.github.io/valhalla/) routing service at `valhalla1.openstreetmap.de`, run by the [FOSSGIS](https://www.fossgis.de) community. Valhalla is open source under the MIT licence, and it routes on OpenStreetMap data, with © OpenStreetMap contributors attribution under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/).

## Software

Karta is licensed under [AGPL-3.0](LICENSE). Each SDK package (`core`, `map`, `react` and `theme`) carries its own copy, and the reference host is in `packages/web`. Dependency licences are recorded in the installed packages' licence files.

Maps are drawn with [MapLibre GL JS](https://maplibre.org), which is licensed under the BSD 3-Clause licence.

## Fonts and icons

[IBM Plex Sans](https://github.com/IBM/plex) is self-hosted through the `@fontsource-variable/ibm-plex-sans` package, under the SIL Open Font License 1.1.

Icons are from [Lucide](https://lucide.dev), through the `lucide-react` package, under the ISC licence.
