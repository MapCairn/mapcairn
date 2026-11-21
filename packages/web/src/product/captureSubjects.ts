// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/*
 * What the product page's captures show: one subject for each picture, the
 * place and size it is captured at and the basemap each theme uses. The capture
 * script (`scripts/captureProduct.ts`) takes its pictures from this table, the
 * page (`productContent.ts` and `ProductPlate.tsx`) reads the same table for
 * their size and caption, and a test holds every committed image to it. The
 * words that describe each picture are in `productContent.ts`.
 */

/** The two themes the page is drawn in, and so the two pictures of each subject. */
export const CAPTURE_THEMES = ["light", "dark"] as const;

/** One of {@link CAPTURE_THEMES}. */
export type CaptureTheme = (typeof CAPTURE_THEMES)[number];

/** The id of a subject, which is also the start of its files' names. */
export type CaptureSubjectId = "hero" | "basemaps";

/** The basemap ids a capture uses, which the playground reads from its address. */
export type CaptureBasemapId = "bright" | "fiord";

/** The name a basemap is shown under, in a caption: the playground's own. */
export const CAPTURE_BASEMAP_NAMES: Readonly<Record<CaptureBasemapId, string>> =
  {
    bright: "Bright",
    fiord: "Fiord",
  };

/** One place on the map, in degrees. */
export interface CapturePlace {
  readonly latitude: number;
  readonly longitude: number;
}

/** One thing a capture shows, and how it is taken. */
export interface CaptureSubject {
  readonly id: CaptureSubjectId;
  /** The view the playground opens on, in the address it writes: zoom, latitude and longitude. */
  readonly view: CapturePlace & { readonly zoom: number };
  /** The size the picture is shown at, in CSS pixels; it is captured at twice this. */
  readonly width: number;
  readonly height: number;
  /** Whether the capture is of a phone: a touch screen with the bottom sheet. */
  readonly phone: boolean;
  /** The basemap each theme's picture is taken over. */
  readonly basemaps: Readonly<Record<CaptureTheme, CaptureBasemapId>>;
}

/**
 * Cape Town between the city bowl and the summit of Lion's Head, the view of
 * the hero and of the other captures, so the page shows one place.
 */
const CAPE_TOWN_VIEW = { latitude: -33.9365, longitude: 18.407, zoom: 13 };

/** The basemap of each theme: Bright by day, and Fiord, OpenFreeMap's blue dark style, by night. */
const BY_THEME: Readonly<Record<CaptureTheme, CaptureBasemapId>> = {
  light: "bright",
  dark: "fiord",
};

/** The two ends of the line the hero measures, tapped in this order: the summit of Lion's Head, and then the city bowl (the first tap puts a panel over the lower left, where the summit lies). */
export const HERO_LINE: readonly [CapturePlace, CapturePlace] = [
  { latitude: -33.9355, longitude: 18.3893 },
  { latitude: -33.9249, longitude: 18.4241 },
];

/** The length the hero's measured line reads, which its alt text and the script both state. */
export const HERO_READOUT = "3.42 km";

/** Every subject, in the order the page shows them. */
export const CAPTURE_SUBJECTS: readonly CaptureSubject[] = [
  {
    id: "hero",
    view: CAPE_TOWN_VIEW,
    width: 400,
    height: 520,
    phone: false,
    basemaps: BY_THEME,
  },
  {
    id: "basemaps",
    view: CAPE_TOWN_VIEW,
    width: 390,
    height: 720,
    phone: true,
    basemaps: BY_THEME,
  },
];

/** The picture is captured at this many device pixels for each CSS pixel, so its text is sharp. */
export const CAPTURE_SCALE = 2;

/** The most bytes the hero's picture may take; the page's other pictures take less. */
export const HERO_BUDGET_BYTES = 60 * 1024;

/** The most bytes any other picture may take. */
export const PICTURE_BUDGET_BYTES = 48 * 1024;

/** The most bytes all the pictures may take together, the page's whole added weight. */
export const TOTAL_BUDGET_BYTES = 300 * 1024;

/** The name of a picture's file, which sits in `src/product/captures`. */
export function captureFileName(
  id: CaptureSubjectId,
  theme: CaptureTheme,
): string {
  return `${id}-${theme}.webp`;
}

/** The subject with an id; a subject the table does not hold is a mistake in the caller. */
export function captureSubject(id: CaptureSubjectId): CaptureSubject {
  const subject = CAPTURE_SUBJECTS.find((candidate) => candidate.id === id);
  if (subject === undefined) {
    throw new Error(`No capture subject ${id}.`);
  }
  return subject;
}

/** The address of the playground over a subject's view and a theme's basemap. */
export function captureAddress(
  subject: CaptureSubject,
  theme: CaptureTheme,
): string {
  const { zoom, latitude, longitude } = subject.view;
  return `#map=${zoom.toFixed(2)}/${latitude.toFixed(5)}/${longitude.toFixed(5)}&basemap=${subject.basemaps[theme]}`;
}

/** The most bytes the picture of a subject may take. */
export function captureBudgetBytes(id: CaptureSubjectId): number {
  return id === "hero" ? HERO_BUDGET_BYTES : PICTURE_BUDGET_BYTES;
}
