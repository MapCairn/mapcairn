// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * Rainfall estimated from satellites every half hour: the NASA GPM IMERG
 * 30-minute precipitation rate, served by NASA GIBS as WMTS tiles named by
 * the slot's start (`2026-11-11T14:30:00Z`), in millimetres of rain an hour,
 * on the same colour scale as the daily layer. Level 6 is the deepest tile
 * level. Probed on 2026-11-11: a slot first answered between about five and
 * three quarter hours and six hours ten minutes after it started (14:30 was
 * there at 20:14 UTC; 15:00 was a 404 until about 21:08), and the
 * capabilities document lagged an hour behind the tiles, so the newest slot
 * offered is seven hours back, worked out from the clock, never from the
 * capabilities. Recent slots come from the IMERG Early run and
 * older ones from the Final run, so the credit links the IMERG page, which
 * covers both, and its text differs from the daily layer's so that both stay
 * in the credits when both layers are on (credits are de-duplicated by text).
 * The first slot is 1998-01-01 00:00 UTC (re-probed on 2026-11-11: it and
 * later 1998 slots answer, 1997-12-31 answers 404, although the capabilities
 * list only 2026 onwards); a slot GIBS lacks answers 404, which shows as
 * tiles that fail to load.
 */
const rainfallHalfHourly: TileLayerDefinition = {
  id: "rainfall-half-hourly",
  name: "layer.rainfall-half-hourly.name",
  description: "layer.rainfall-half-hourly.description",
  group: "layer.group.floodsStormsAndDroughts",
  dataCost: "layer.rainfall-half-hourly.dataCost",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
    {
      text: "GPM IMERG half-hourly precipitation (Early and Final runs), Huffman, G. J., Stocker, E. F., Bolvin, D. T., Nelkin, E. J., Tan, J., NASA GES DISC",
      url: "https://gpm.nasa.gov/data/imerg",
    },
  ],
  disclaimer: "layer.rainfall-half-hourly.disclaimer",
  controls: [
    {
      kind: "datetime",
      id: "time",
      label: "layer.rainfall-half-hourly.control.time.label",
      description: "layer.rainfall-half-hourly.control.time.description",
      stepMinutes: 30,
      min: "1998-01-01t0000",
      max: { minutesAgo: 420 },
      default: { minutesAgo: 420 },
    },
    {
      kind: "opacity",
      id: "opacity",
      label: "layer.control.opacity",
      default: 0.8,
    },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 6,
  },
};

export default rainfallHalfHourly;
