// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/*
 * What the product page's captures show: one subject for each picture, the
 * place and size it is captured at and the basemap each theme uses. The capture
 * script (`scripts/captureProduct.ts`) takes its pictures from this table, the
 * page (`productContent.ts` and `DemoFigure.tsx`) reads the same table for
 * their size and caption, and a test holds every committed image to it. The
 * words that describe each picture are in `productContent.ts`.
 */

/** The two themes the page is drawn in, and so the two pictures of each subject. */
export const CAPTURE_THEMES = ["light", "dark"] as const;

/** One of {@link CAPTURE_THEMES}. */
export type CaptureTheme = (typeof CAPTURE_THEMES)[number];

/** The id of a subject, which is also the start of its files' names. */
export type CaptureSubjectId = "hero" | "heroWide";

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

/**
 * What the page is made to show before the picture is taken: a line measured
 * between two places, tapped in order, whose length the picture reads.
 */
export interface CaptureArrangement {
  /** The two ends of the line, tapped in this order. */
  readonly line: readonly [CapturePlace, CapturePlace];
  /** The length the line reads, which the subject's words state and the script checks. */
  readonly readout: string;
}

/** One thing a capture shows, and how it is taken. */
export interface CaptureSubject {
  readonly id: CaptureSubjectId;
  /** The view the playground opens on, in the address it writes: zoom, latitude and longitude. */
  readonly view: CapturePlace & { readonly zoom: number };
  /** The size the picture is shown at, in CSS pixels; it is captured at twice this. */
  readonly width: number;
  readonly height: number;
  /** The basemap each theme's picture is taken over. */
  readonly basemaps: Readonly<Record<CaptureTheme, CaptureBasemapId>>;
  /** What the page is made to show first. */
  readonly arrangement: CaptureArrangement;
  /** The most bytes either theme's picture may take. */
  readonly budgetBytes: number;
}

/**
 * Cape Town between the city bowl and the summit of Lion's Head, the view of
 * both pictures.
 */
const CAPE_TOWN_VIEW = { latitude: -33.9365, longitude: 18.407, zoom: 13 };

/** The basemap of each theme: Bright by day, and Fiord, OpenFreeMap's blue dark style, by night. */
const BY_THEME: Readonly<Record<CaptureTheme, CaptureBasemapId>> = {
  light: "bright",
  dark: "fiord",
};

/** The line both pictures measure, from the slopes of Lion's Head to the city centre, and what it reads. */
const LION_HEAD_LINE: CaptureArrangement = {
  // Tapped from the summit first: the first tap puts a panel over the lower left, where the summit lies.
  line: [
    { latitude: -33.9355, longitude: 18.3893 },
    { latitude: -33.9249, longitude: 18.4241 },
  ],
  readout: "3.42 km",
};

/**
 * Every subject, in the order the page shows them: one view at two sizes. The
 * narrow picture is the playground at a phone's width, shown on a phone; the
 * wide one is the playground on a wide screen, shown from the tablet width and
 * up to its own 1152 px on a large screen, wider than the text column.
 */
export const CAPTURE_SUBJECTS: readonly CaptureSubject[] = [
  {
    id: "hero",
    view: CAPE_TOWN_VIEW,
    width: 400,
    height: 520,
    basemaps: BY_THEME,
    arrangement: LION_HEAD_LINE,
    budgetBytes: 60 * 1024,
  },
  {
    id: "heroWide",
    view: CAPE_TOWN_VIEW,
    width: 1152,
    height: 640,
    basemaps: BY_THEME,
    arrangement: LION_HEAD_LINE,
    budgetBytes: 180 * 1024,
  },
];

/** The picture is captured at this many device pixels for each CSS pixel, so its text is sharp. */
export const CAPTURE_SCALE = 2;

/** The most bytes all the pictures may take together, the page's whole added weight. */
export const TOTAL_BUDGET_BYTES = 480 * 1024;

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

/** The address of the playground over a subject's view alone: zoom, latitude and longitude, with the basemap left to the playground. */
export function captureView(subject: CaptureSubject): string {
  const { zoom, latitude, longitude } = subject.view;
  return `#map=${zoom.toFixed(2)}/${latitude.toFixed(5)}/${longitude.toFixed(5)}`;
}

/** The address of the playground over a subject's view and a theme's basemap. */
export function captureAddress(
  subject: CaptureSubject,
  theme: CaptureTheme,
): string {
  return `${captureView(subject)}&basemap=${subject.basemaps[theme]}`;
}

/** The length a subject's measured line reads. */
export function measuredReadout(id: CaptureSubjectId): string {
  return captureSubject(id).arrangement.readout;
}
