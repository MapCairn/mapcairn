# Attributions

The reference host bundles no datasets. Its basemaps and its open data layers use third-party services, fetched by the browser only when someone turns a layer on.

## Open data layers

Each layer's definition in `packages/web/src/layers/definitions/` carries the credit below, and the map credits show it while the layer is on. A test fails if a definition's credit is missing here.

| Layer                                                     | Source                                                                                                                                                                                                                                                                                                                                                                 | Credit                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earthquakes                                               | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/) GeoJSON feeds, US public domain                                                                                                                                                                                                                                                       | Credit: U.S. Geological Survey                                                                                                                                              |
| Fire, flood, tropical cyclone, volcano and drought alerts | [GDACS](https://www.gdacs.org/) event feed, a joint initiative of the United Nations and the European Commission, under CC BY 4.0 (basis below)                                                                                                                                                                                                                        | Global Disaster Alert and Coordination System, GDACS                                                                                                                        |
| Earth at night                                            | [NASA Black Marble](https://blackmarble.gsfc.nasa.gov/) VIIRS night lights, a 2016 annual composite served by GIBS                                                                                                                                                                                                                                                     | VIIRS Black Marble night lights, NASA Earth Observatory                                                                                                                     |
| Where people live                                         | [GPWv4](https://sedac.ciesin.columbia.edu/data/collection/gpw-v4) population density for 2020, NASA SEDAC, served by GIBS, openly shared without restriction under the EOSDIS Data Use and Citation Guidance                                                                                                                                                           | Center for International Earth Science Information Network (CIESIN), Columbia University: Gridded Population of the World, Version 4 (GPWv4), NASA SEDAC                    |
| Sea temperature compared with normal                      | [GHRSST MUR](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1) sea surface temperature anomalies, NASA JPL PO.DAAC, served by GIBS                                                                                                                                                                                                                             | GHRSST Level 4 MUR sea surface temperature analysis, NASA JPL PO.DAAC                                                                                                       |
| Countries by population                                   | [Natural Earth](https://www.naturalearthdata.com/) 1:110m country boundaries, public domain, served by the jsDelivr content delivery network                                                                                                                                                                                                                           | Made with Natural Earth                                                                                                                                                     |
| Fire hotspots                                             | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api), MODIS Terra and VIIRS NOAA-21 thermal anomalies                                                                                                                                                                                                    | We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS). |
| Satellite imagery                                         | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api), VIIRS NOAA-21 corrected reflectance                                                                                                                                                                                                                | We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS). |
| Rainfall                                                  | [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg) daily precipitation rate, served by GIBS (a daily image NASA makes from the 30-minute IMERG data: the newest days come from the [Early run](https://doi.org/10.5067/GPM/IMERG/3B-HH-E/07) and are replaced by the [Final run](https://doi.org/10.5067/GPM/IMERG/3B-HH/07) when it is ready, about four months later) | GPM IMERG precipitation, Huffman, G. J., Stocker, E. F., Bolvin, D. T., Nelkin, E. J., Tan, J., NASA GES DISC                                                               |
| Rainfall, half-hourly                                     | [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg) 30-minute precipitation rate, served by GIBS as `IMERG_Precipitation_Rate_30min`, one image per half hour (recent half hours come from the [Early run](https://doi.org/10.5067/GPM/IMERG/3B-HH-E/07), older ones from the [Final run](https://doi.org/10.5067/GPM/IMERG/3B-HH/07))                                   | GPM IMERG half-hourly precipitation (Early and Final runs), Huffman, G. J., Stocker, E. F., Bolvin, D. T., Nelkin, E. J., Tan, J., NASA GES DISC                            |

Checked on 2026-11-11 for the half-hourly layer: GIBS answers a tile with `Access-Control-Allow-Origin: *` and no key, as a 256 px PNG of about 1 to 10 KB, for levels 0 to 6, and names a half hour by `YYYY-MM-DDTHH:MM:SSZ`. A half hour first answered between about 5 hours 45 minutes and 6 hours 10 minutes after it started (14:30 UTC was there at 20:14 UTC; 15:00 UTC was a 404 at 20:48 and answered by 21:09), and the capabilities document listed a newest time an hour behind the tiles, so the app offers half hours up to seven hours back, worked out from the clock. GIBS reports the Early run (`v7_NRT`) for half hours from at least September 2025 on, and the Final run (`v7_STD`) for June 2025 and before. Tiles answer back to 1998-01-01 00:00 UTC (1997-12-31 answers 404), although the capabilities document lists times from 2026 only, so the layer offers half hours from 1998-01-01.

NASA data is openly shared; its data use guidance says NASA material may not be used to suggest or imply endorsement by NASA, and the app uses no NASA logo. The GIBS acknowledgement is the full wording from the GIBS "Data Use Guidance and Acknowledgements" page. GDACS alerts are automatic model outputs and the app says so on every card.

GDACS (read 2026-11-21): the credit the layers show is the one this project uses, not wording GDACS gives. The [GDACS terms of use](https://www.gdacs.org/About/termofuse.aspx) name the United Nations and the European Commission as partners and are a disclaimer: automatic alerts, no warranty, not a substitute for official warnings. They state no licence and no credit, and the API documentation page states neither. The page footer links the European Commission [legal notice](https://commission.europa.eu/legal-notice_en#copyright-notice), whose default is CC BY 4.0 with appropriate credit for content the EU owns, unless an individual copyright notice says otherwise and with third-party material excluded. That default is the basis for the licence in the table. It is not confirmed with GDACS.

## Basemaps

| Source                                         | Use                                                               | Credit                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [OpenFreeMap](https://openfreemap.org)         | Bright, Liberty, Positron, Fiord and Dark vector styles and tiles | OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors                                                      |
| [OpenStreetMap](https://www.openstreetmap.org) | Streets raster tiles from `tile.openstreetmap.org`                | © OpenStreetMap contributors, linked to [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright) |

OpenStreetMap data is available under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/). Use of the OpenStreetMap tile servers follows the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). The map displays the active provider's attribution, followed by MapLibre's.

The reference site offers six basemaps: Bright, Liberty, Positron, Streets, Fiord and Dark, all from the SDK. The SDK in `packages/core` defines seven basemaps: Bright, Positron, Dark, Liberty and Fiord (OpenFreeMap), Streets, and Colorful (a pre-built style from [VersaTiles](https://versatiles.org)), which the site does not offer and does not load from. A host that offers Colorful carries VersaTiles' own credit terms, including the ESA WorldCover credit for its land cover tiles, which the SDK's definition holds.

### Basemap previews

The basemap picker previews in `packages/web/public/basemaps/` are small images of the Cape Town Waterfront, rendered with MapLibre GL JS from the providers' own tiles by `scripts/generateBasemapThumbnails.mjs`. They carry the same credits as the maps they show:

| Preview                                  | Source                              | Credit                                                                                                                                  |
| ---------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `bright.jpg`, `positron.jpg`, `dark.jpg` | OpenFreeMap vector tiles and styles | © OpenMapTiles, Data from OpenStreetMap (© OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)), OpenFreeMap |
| `osm.jpg`                                | OpenStreetMap standard tiles        | © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)                                                        |

OpenFreeMap asks for this attribution wherever its maps appear in images or other media. Regenerate the previews with the script rather than editing them by hand, and keep this table in step with the basemap definitions in `packages/core/src/basemaps` and `packages/web/src/basemaps`.

The social preview images are the project's own: `packages/web/public/og-image.png`, for the playground, is generated by `packages/web/scripts/generateOgImage.ts`, and `packages/web/public/og-sdk.png`, for the product page, by `packages/web/scripts/generateSdkOgImage.ts` from the page's own contour art (`scripts/generateContours.mjs`, a made-up terrain). Neither holds map tiles.

### README images

The screenshots and the recording in `docs/images/` are captures of the live reference site, not renders of the SDK's own fixtures, and they show the credits the app shows. They show the Bright basemap (light) and the Dark basemap (dark) from OpenFreeMap, with the earthquakes layer on for the past week:

| Image                                                                                            | Shows                                                      | Credit                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playground-light.png`, `playground-dark.png`, `playground-demo.gif`, `playground-demo-dark.gif` | OpenFreeMap vector tiles and styles, the Earthquakes layer | © OpenMapTiles, Data from OpenStreetMap (© OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)), OpenFreeMap, MapLibre, U.S. Geological Survey |

## Place search

Place search and reverse geocoding use [OpenStreetMap Nominatim](https://nominatim.org), with © OpenStreetMap contributors attribution. Suggestions as you type in the search box use [Photon](https://photon.komoot.io), a geocoder run by komoot on OpenStreetMap data, with © OpenStreetMap contributors attribution under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/).

## Routing

Routes and travel-time areas come from the public [Valhalla](https://valhalla.github.io/valhalla/) routing service at `valhalla1.openstreetmap.de`, run by the [FOSSGIS](https://www.fossgis.de) community. Valhalla is open source under the MIT licence, and it routes on OpenStreetMap data, with © OpenStreetMap contributors attribution under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/).

The public server is a free service, not part of the open data, and it is used under the [FOSSGIS usage terms](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen) (in German). In short, they ask for clear OpenStreetMap attribution and a link to [Fix the map](https://www.openstreetmap.org/fixthemap), no more than one request a second, a contact address for the site, and no bulk downloading. Commercial use is allowed only when routing is not a substantial part of an online offering, such as a directions sketch on a website, and sites with high traffic are generally not permitted. There is one server and no availability guarantee, and FOSSGIS may change the service or the terms, or withdraw permission, at any time without notice.

## Translations

The interface text is written in British English. The Afrikaans catalogue (`packages/web/src/i18n/af.ts`) began as a machine-translated draft and was reviewed by the maintainer, a fluent speaker.

## Software

MapCairn is licensed under [AGPL-3.0](LICENSE). Each SDK package (`core`, `map`, `react` and `theme`) carries its own copy, and the reference host is in `packages/web`. Dependency licences are recorded in the installed packages' licence files.

Maps are drawn with [MapLibre GL JS](https://maplibre.org), which is licensed under the BSD 3-Clause licence.

## Fonts and icons

[IBM Plex Sans](https://github.com/IBM/plex) is self-hosted through the `@fontsource-variable/ibm-plex-sans` package, under the SIL Open Font License 1.1.

Icons are from [Lucide](https://lucide.dev), through the `lucide-react` package, under the ISC licence.

## Guidelines

The `review-ui` skill (`.claude/skills/review-ui`) adapts the rules of the [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) by Vercel Labs, taken at commit `434b7f9`, under the MIT licence (Copyright (c) 2025 Vercel Labs). The licence text is kept in the skill's `references/rules.md`.

The `web-platform-guidance` skill (`.claude/skills/web-platform-guidance`) adapts the procedure of the skill that ships with the [`modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance) package by the Chrome team, under the Apache-2.0 licence. It reads the package's guides from the copy listed in the root `devDependencies` (version 1.0.0). The package is a development tool and is not shipped with the SDK packages or the site.
