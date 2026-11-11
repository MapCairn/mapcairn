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
| [OpenFreeMap](https://openfreemap.org) | Bright, Liberty, Positron, Fiord and Dark vector styles and tiles | OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors |
| [VersaTiles](https://versatiles.org) | Colorful vector style and tiles from the public tile server at `tiles.versatiles.org` | © OpenStreetMap contributors, VersaTiles, © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium, CC BY 4.0 |
| [OpenStreetMap](https://www.openstreetmap.org) | Streets raster tiles from `tile.openstreetmap.org` | © OpenStreetMap contributors, linked to [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright) |

OpenStreetMap data is available under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/). Use of the OpenStreetMap tile servers follows the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). The map displays the active provider's attribution, followed by MapLibre's.

### VersaTiles Colorful

Colorful is the pre-built `colorful` style from [VersaTiles](https://versatiles.org), loaded from `https://tiles.versatiles.org/assets/styles/colorful/style.json`. Its tiles, sprite and glyphs come from the same host. What VersaTiles' documentation says, checked on 2026-11-11:

- The [public tile server guide](https://docs.versatiles.org/guides/use_tiles_versatiles_org.html) says the server is "a demo server for VersaTiles. It is free and open to everyone, but it comes without any guarantees". It asks for no key, registration, logo or fee, and sets no commercial restriction. It recommends a CDN in front of the server for high traffic, rate-limits requests per IP address (answering 429 with `Retry-After`), warns that hosted styles and tilesets can change, and recommends self-hosting for anyone who needs a stable server.
- On attribution it says: "Our pre-built styles already contain the required attribution, and MapLibre GL JS displays it automatically." The style's two sources carry "© OpenStreetMap contributors" (linked to the OpenStreetMap copyright page) and, for the land cover tiles, "ESA WorldCover 2021 (CC BY 4.0)". The ESA text below is the longer wording ESA and VersaTiles ask for, so Colorful shows that, with the licence linked as its own CC BY 4.0 entry. The style's own metadata names its licence as [CC0](https://creativecommons.org/publicdomain/zero/1.0/); the [versatiles-style](https://github.com/versatiles-org/versatiles-style) source code is MIT and its sprite sheets are CC0. MapCairn loads the published style at run time and copies none of it.
- The [tilesets page](https://docs.versatiles.org/basics/tilesets.html) says OpenStreetMap data "requires attribution to OpenStreetMap contributors" and that the Shortbread schema "does not require additional attribution". For the land cover tileset it gives the attribution "© OpenStreetMap contributors, © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium", with the ESA data licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Colorful shows that longer text in full (the style's own shorter form leaves out the Copernicus Sentinel notice). ESA's [download page](https://worldcover2021.esa.int/download) gives the same wording for a map layer. The image export wraps long credits onto more lines.
- VersaTiles' documentation asks for no credit of its own. The credits name it as the provider; that is a courtesy, not a requirement, and implies no endorsement by VersaTiles of MapCairn.
- Logging: "Requests are logged in anonymized form. We use these logs only to track down issues and to detect obvious misuse." The privacy page says this in the same words.
- The documentation does not state a usage policy beyond the above. The reference host sends no more than a person's own map use needs, from the browser, with no key.

The ESA WorldCover credit is there because Colorful's style draws a land cover layer from the VersaTiles `landcover-vectors` tileset, which is part of the style and cannot be left out without changing it.

### Basemap previews

The basemap picker previews in `packages/web/public/basemaps/` are small images of the Cape Town Waterfront, rendered with MapLibre GL JS from the providers' own tiles by `scripts/generateBasemapThumbnails.mjs`. They carry the same credits as the maps they show:

| Preview | Source | Credit |
|---|---|---|
| `bright.jpg`, `liberty.jpg`, `positron.jpg`, `fiord.jpg`, `dark.jpg` | OpenFreeMap vector tiles and styles | © OpenMapTiles, Data from OpenStreetMap (© OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)), OpenFreeMap |
| `colorful.jpg` | VersaTiles Colorful style and tiles | © OpenStreetMap contributors ([ODbL](https://opendatacommons.org/licenses/odbl/)), VersaTiles, ESA WorldCover project 2021 and modified Copernicus Sentinel data (2021) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) |
| `osm.jpg` | OpenStreetMap standard tiles | © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/) |

OpenFreeMap asks for this attribution wherever its maps appear in images or other media. Regenerate the previews with the script rather than editing them by hand, and keep this table in step with the basemap definitions in `packages/core/src/basemaps` and `packages/web/src/basemaps`.

The social preview image (`packages/web/public/og-image.png`) is generated by `packages/web/scripts/generateOgImage.ts`.

## Place search

Place search and reverse geocoding use [OpenStreetMap Nominatim](https://nominatim.org), with © OpenStreetMap contributors attribution.

## Routing

Routes and travel-time areas come from the public [Valhalla](https://valhalla.github.io/valhalla/) routing service at `valhalla1.openstreetmap.de`, run by the [FOSSGIS](https://www.fossgis.de) community. Valhalla is open source under the MIT licence, and it routes on OpenStreetMap data, with © OpenStreetMap contributors attribution under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/).

## Software

MapCairn is licensed under [AGPL-3.0](LICENSE). Each SDK package (`core`, `map`, `react` and `theme`) carries its own copy, and the reference host is in `packages/web`. Dependency licences are recorded in the installed packages' licence files.

Maps are drawn with [MapLibre GL JS](https://maplibre.org), which is licensed under the BSD 3-Clause licence.

## Fonts and icons

[IBM Plex Sans](https://github.com/IBM/plex) is self-hosted through the `@fontsource-variable/ibm-plex-sans` package, under the SIL Open Font License 1.1.

Icons are from [Lucide](https://lucide.dev), through the `lucide-react` package, under the ISC licence.
