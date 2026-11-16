// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import {
  AIRY_1830,
  GRS80,
  inverseLambertConformalConic,
  inverseTransverseMercator,
  inverseWebMercator,
  type LonLat,
  WGS84,
} from "./projections.js";

/** A coordinate system a file with out-of-range coordinates might be in. */
export interface CandidateSystem {
  /** An EPSG code such as `EPSG:3857`. */
  readonly code: string;
  readonly name: string;
  /** West, south, east and north of where the system is meant to be used, in degrees. */
  readonly areaOfUse: readonly [number, number, number, number];
  /** Longitude and latitude from the system's x and y, in metres. */
  readonly inverse: (x: number, y: number) => LonLat;
  /** Why a pair of numbers could be in this system, written for the finding. */
  readonly describeRange: string;
}

/** How far outside its area of use a result may fall and still count as a fit, in degrees. */
const AREA_MARGIN = 0.5;

/** The most a Web Mercator y can be, and so the latitude limit of the system. */
const WEB_MERCATOR_LATITUDE_LIMIT = 85.06;

/** Whether the longitude and latitude fall inside the area of use, with a small margin. */
export function fitsArea(system: CandidateSystem, point: LonLat): boolean {
  const [west, south, east, north] = system.areaOfUse;
  const [longitude, latitude] = point;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= west - AREA_MARGIN &&
    longitude <= east + AREA_MARGIN &&
    latitude >= south - AREA_MARGIN &&
    latitude <= north + AREA_MARGIN
  );
}

/** The UTM zone's central meridian, in degrees. */
function zoneMeridian(zone: number): number {
  return zone * 6 - 183;
}

const UTM_NORTH_CODE_BASE = 32600;
const UTM_SOUTH_CODE_BASE = 32700;
const UTM_SCALE = 0.9996;
const UTM_FALSE_EASTING = 500000;
const UTM_SOUTH_FALSE_NORTHING = 10000000;
const UTM_ZONES = 60;
const UTM_HALF_ZONE = 3;
const UTM_SOUTH_LIMIT = -80;
const UTM_NORTH_LIMIT = 84;

/** One UTM zone, north or south, on WGS 84. */
export function utmSystem(zone: number, north: boolean): CandidateSystem {
  const meridian = zoneMeridian(zone);
  const projection = {
    ellipsoid: WGS84,
    centralMeridian: meridian,
    latitudeOfOrigin: 0,
    scale: UTM_SCALE,
    falseEasting: UTM_FALSE_EASTING,
    falseNorthing: north ? 0 : UTM_SOUTH_FALSE_NORTHING,
  };
  return {
    code: `EPSG:${(north ? UTM_NORTH_CODE_BASE : UTM_SOUTH_CODE_BASE) + zone}`,
    name: `WGS 84 / UTM zone ${zone}${north ? "N" : "S"}`,
    areaOfUse: [
      meridian - UTM_HALF_ZONE,
      north ? 0 : UTM_SOUTH_LIMIT,
      meridian + UTM_HALF_ZONE,
      north ? UTM_NORTH_LIMIT : 0,
    ],
    inverse: (x, y) => inverseTransverseMercator(projection, x, y),
    describeRange:
      "easting between 166,000 and 834,000 and a northing that fits the hemisphere",
  };
}

/** Every UTM zone, north then south. */
export function allUtmZones(): CandidateSystem[] {
  const zones = Array.from({ length: UTM_ZONES }, (_, index) => index + 1);
  return [
    ...zones.map((zone) => utmSystem(zone, true)),
    ...zones.map((zone) => utmSystem(zone, false)),
  ];
}

const webMercator: CandidateSystem = {
  code: "EPSG:3857",
  name: "WGS 84 / Pseudo-Mercator (Web Mercator)",
  areaOfUse: [
    -180,
    -WEB_MERCATOR_LATITUDE_LIMIT,
    180,
    WEB_MERCATOR_LATITUDE_LIMIT,
  ],
  inverse: inverseWebMercator,
  describeRange:
    "metres from the equator and the prime meridian, up to about 20 million",
};

/** West, south, east and north of the area the British National Grid covers, in degrees. */
const BRITISH_NATIONAL_GRID_AREA = [-9, 49.75, 2, 61] as const;

const britishNationalGrid: CandidateSystem = {
  code: "EPSG:27700",
  name: "OSGB36 / British National Grid",
  areaOfUse: BRITISH_NATIONAL_GRID_AREA,
  inverse: (x, y) =>
    inverseTransverseMercator(
      {
        ellipsoid: AIRY_1830,
        centralMeridian: -2,
        latitudeOfOrigin: 49,
        scale: 0.9996012717,
        falseEasting: 400000,
        falseNorthing: -100000,
      },
      x,
      y,
    ),
  describeRange: "an easting under 700,000 and a northing under 1,300,000",
};

const irishTransverseMercator: CandidateSystem = {
  code: "EPSG:2157",
  name: "IRENET95 / Irish Transverse Mercator",
  areaOfUse: [-10.5, 51.4, -5.9, 55.5],
  inverse: (x, y) =>
    inverseTransverseMercator(
      {
        ellipsoid: GRS80,
        centralMeridian: -8,
        latitudeOfOrigin: 53.5,
        scale: 0.99982,
        falseEasting: 600000,
        falseNorthing: 750000,
      },
      x,
      y,
    ),
  describeRange: "an easting around 600,000 and a northing around 750,000",
};

const lambert93: CandidateSystem = {
  code: "EPSG:2154",
  name: "RGF93 v1 / Lambert-93",
  areaOfUse: [-9.86, 41.15, 10.38, 51.56],
  inverse: (x, y) =>
    inverseLambertConformalConic(
      {
        ellipsoid: GRS80,
        firstParallel: 49,
        secondParallel: 44,
        latitudeOfOrigin: 46.5,
        centralMeridian: 3,
        falseEasting: 700000,
        falseNorthing: 6600000,
      },
      x,
      y,
    ),
  describeRange: "an easting around 700,000 and a northing around 6,600,000",
};

/**
 * The systems besides UTM that are tried. Adding a national grid is adding an
 * entry here; the rule does not change.
 */
export const OTHER_SYSTEMS: readonly CandidateSystem[] = [
  webMercator,
  britishNationalGrid,
  irishTransverseMercator,
  lambert93,
];
