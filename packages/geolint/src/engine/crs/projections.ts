// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

/** A longitude and a latitude in degrees. */
export type LonLat = readonly [longitude: number, latitude: number];

/** An ellipsoid by its semi-major axis and flattening. */
export interface Ellipsoid {
  readonly a: number;
  readonly f: number;
}

/** The WGS 84 ellipsoid, which GPS and GeoJSON use. */
export const WGS84: Ellipsoid = { a: 6378137, f: 1 / 298.257223563 };

/** The GRS 80 ellipsoid, which ETRS89 and so Lambert-93 and the Irish grid use. It differs from WGS 84 by less than a millimetre. */
export const GRS80: Ellipsoid = { a: 6378137, f: 1 / 298.257222101 };

/** The Airy 1830 ellipsoid, which the British National Grid uses. */
export const AIRY_1830: Ellipsoid = { a: 6377563.396, f: 1 / 299.3249646 };

const DEGREES = Math.PI / 180;

function eccentricity(ellipsoid: Ellipsoid): number {
  return Math.sqrt(ellipsoid.f * (2 - ellipsoid.f));
}

/** The geodetic latitude of a conformal latitude, by fixed-point iteration (it settles in a few steps). */
function geodeticFromConformal(conformal: number, e: number): number {
  let latitude = conformal;
  for (let step = 0; step < 8; step++) {
    latitude = Math.atan(
      Math.sinh(
        Math.asinh(Math.tan(conformal)) +
          e * Math.atanh(e * Math.sin(latitude)),
      ),
    );
  }
  return latitude;
}

/** The conformal latitude of a geodetic latitude, in radians. */
function conformalLatitude(latitude: number, e: number): number {
  return Math.atan(
    Math.sinh(
      Math.asinh(Math.tan(latitude)) - e * Math.atanh(e * Math.sin(latitude)),
    ),
  );
}

/** The definition of a transverse Mercator projection (UTM, a national grid). */
export interface TransverseMercator {
  readonly ellipsoid: Ellipsoid;
  /** Longitude of the central meridian, degrees. */
  readonly centralMeridian: number;
  /** Latitude of the origin, degrees. */
  readonly latitudeOfOrigin: number;
  readonly scale: number;
  readonly falseEasting: number;
  readonly falseNorthing: number;
}

/**
 * Longitude and latitude from easting and northing in a transverse Mercator
 * projection, by the Krüger series (accurate to a millimetre within a few
 * degrees of the central meridian, and good to a metre far beyond it).
 */
export function inverseTransverseMercator(
  projection: TransverseMercator,
  easting: number,
  northing: number,
): LonLat {
  const { ellipsoid, scale } = projection;
  const e = eccentricity(ellipsoid);
  const n = ellipsoid.f / (2 - ellipsoid.f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const rectifyingRadius = (ellipsoid.a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  const alpha = [
    n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
    (61 * n3) / 240 - (103 * n4) / 140,
    (49561 * n4) / 161280,
  ];
  const beta = [
    n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360,
    n2 / 48 + n3 / 15 - (437 * n4) / 1440,
    (17 * n3) / 480 - (37 * n4) / 840,
    (4397 * n4) / 161280,
  ];

  const originConformal = conformalLatitude(
    projection.latitudeOfOrigin * DEGREES,
    e,
  );
  const originXi =
    originConformal +
    alpha.reduce(
      (sum, a, j) => sum + a * Math.sin(2 * (j + 1) * originConformal),
      0,
    );

  const xi =
    (northing - projection.falseNorthing) / (scale * rectifyingRadius) +
    originXi;
  const eta = (easting - projection.falseEasting) / (scale * rectifyingRadius);
  const xiPrime =
    xi -
    beta.reduce(
      (sum, b, j) =>
        sum + b * Math.sin(2 * (j + 1) * xi) * Math.cosh(2 * (j + 1) * eta),
      0,
    );
  const etaPrime =
    eta -
    beta.reduce(
      (sum, b, j) =>
        sum + b * Math.cos(2 * (j + 1) * xi) * Math.sinh(2 * (j + 1) * eta),
      0,
    );
  const conformal = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  const longitude =
    projection.centralMeridian * DEGREES +
    Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));
  return [longitude / DEGREES, geodeticFromConformal(conformal, e) / DEGREES];
}

/** The definition of a two-standard-parallel Lambert conformal conic projection. */
export interface LambertConformalConic {
  readonly ellipsoid: Ellipsoid;
  readonly firstParallel: number;
  readonly secondParallel: number;
  readonly latitudeOfOrigin: number;
  readonly centralMeridian: number;
  readonly falseEasting: number;
  readonly falseNorthing: number;
}

function m(latitude: number, e: number): number {
  const sine = Math.sin(latitude);
  return Math.cos(latitude) / Math.sqrt(1 - e * e * sine * sine);
}

function t(latitude: number, e: number): number {
  const sine = Math.sin(latitude);
  return (
    Math.tan(Math.PI / 4 - latitude / 2) /
    ((1 - e * sine) / (1 + e * sine)) ** (e / 2)
  );
}

/** Longitude and latitude from easting and northing in a Lambert conformal conic projection. */
export function inverseLambertConformalConic(
  projection: LambertConformalConic,
  easting: number,
  northing: number,
): LonLat {
  const e = eccentricity(projection.ellipsoid);
  const { a } = projection.ellipsoid;
  const phi1 = projection.firstParallel * DEGREES;
  const phi2 = projection.secondParallel * DEGREES;
  const cone =
    (Math.log(m(phi1, e)) - Math.log(m(phi2, e))) /
    (Math.log(t(phi1, e)) - Math.log(t(phi2, e)));
  const f = m(phi1, e) / (cone * t(phi1, e) ** cone);
  const rho0 = a * f * t(projection.latitudeOfOrigin * DEGREES, e) ** cone;

  const dx = easting - projection.falseEasting;
  const dy = rho0 - (northing - projection.falseNorthing);
  const rho = Math.sign(cone) * Math.hypot(dx, dy);
  const tPrime = (rho / (a * f)) ** (1 / cone);
  const theta = Math.atan2(Math.sign(cone) * dx, Math.sign(cone) * dy);
  let latitude = Math.PI / 2 - 2 * Math.atan(tPrime);
  for (let step = 0; step < 8; step++) {
    const sine = Math.sin(latitude);
    latitude =
      Math.PI / 2 -
      2 * Math.atan(tPrime * ((1 - e * sine) / (1 + e * sine)) ** (e / 2));
  }
  return [
    theta / cone / DEGREES + projection.centralMeridian,
    latitude / DEGREES,
  ];
}

/** The radius of the sphere Web Mercator uses, in metres. */
export const WEB_MERCATOR_RADIUS = WGS84.a;

/** Longitude and latitude from Web Mercator (EPSG:3857) metres. */
export function inverseWebMercator(x: number, y: number): LonLat {
  return [
    x / WEB_MERCATOR_RADIUS / DEGREES,
    (2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2) / DEGREES,
  ];
}
