const METRES_PER_FOOT = 0.3048;
const METRES_PER_MILE = 1609.344;
const SQUARE_METRES_PER_SQUARE_FOOT = METRES_PER_FOOT ** 2;
const SQUARE_METRES_PER_ACRE = 4046.8564224;
const SQUARE_METRES_PER_SQUARE_MILE = METRES_PER_MILE ** 2;
const SQUARE_METRES_PER_HECTARE = 10_000;
const SQUARE_METRES_PER_SQUARE_KILOMETRE = 1_000_000;

/** Converts metres to international feet. */
export function metresToFeet(metres: number): number {
  return metres / METRES_PER_FOOT;
}

/** Converts metres to international miles. */
export function metresToMiles(metres: number): number {
  return metres / METRES_PER_MILE;
}

/** Converts metres to kilometres. */
export function metresToKilometres(metres: number): number {
  return metres / 1000;
}

/** Converts kilometres to metres. */
export function kilometresToMetres(kilometres: number): number {
  return kilometres * 1000;
}

/** Converts international feet to metres. */
export function feetToMetres(feet: number): number {
  return feet * METRES_PER_FOOT;
}

/** Converts international miles to metres. */
export function milesToMetres(miles: number): number {
  return miles * METRES_PER_MILE;
}

/** Converts square metres to square feet. */
export function squareMetresToSquareFeet(squareMetres: number): number {
  return squareMetres / SQUARE_METRES_PER_SQUARE_FOOT;
}

/** Converts square metres to acres. */
export function squareMetresToAcres(squareMetres: number): number {
  return squareMetres / SQUARE_METRES_PER_ACRE;
}

/** Converts square metres to square miles. */
export function squareMetresToSquareMiles(squareMetres: number): number {
  return squareMetres / SQUARE_METRES_PER_SQUARE_MILE;
}

/** Converts square metres to hectares. */
export function squareMetresToHectares(squareMetres: number): number {
  return squareMetres / SQUARE_METRES_PER_HECTARE;
}

/** Converts square metres to square kilometres. */
export function squareMetresToSquareKilometres(squareMetres: number): number {
  return squareMetres / SQUARE_METRES_PER_SQUARE_KILOMETRE;
}
