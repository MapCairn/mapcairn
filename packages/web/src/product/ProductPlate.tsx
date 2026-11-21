// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  CAPTURE_THEMES,
  type CaptureSubjectId,
  type CaptureTheme,
  captureSubject,
} from "./captureSubjects";
import basemapsDark from "./captures/basemaps-dark.webp";
import basemapsLight from "./captures/basemaps-light.webp";
import heroDark from "./captures/hero-dark.webp";
import heroLight from "./captures/hero-light.webp";
import * as styles from "./ProductPage.css";
import { type PlateTick, plateGeometry } from "./plateGeometry";
import {
  PLATE_CREDITS_LEAD,
  PLATES,
  plateAlt,
  plateBasemaps,
  plateCredits,
  plateLiveLink,
} from "./productContent";

/** The picture of each subject for each theme, as the build serves them from this site. */
const PICTURES: Readonly<
  Record<CaptureSubjectId, Readonly<Record<CaptureTheme, string>>>
> = {
  hero: { light: heroLight, dark: heroDark },
  basemaps: { light: basemapsLight, dark: basemapsDark },
};

/** The class of the image for a theme: the dark one starts hidden and the page's theme shows it (`ProductPage.css.ts`). */
const THEME_CLASS: Readonly<Record<CaptureTheme, string>> = {
  light: styles.plateLight,
  dark: styles.plateDark,
};

/** How far a tick reaches out from the picture's edge into the collar, in pixels. */
const TICK_LENGTH = 6;

/** A position along an edge as a percentage, which an SVG attribute takes, so no inline style is needed. */
function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

/**
 * The collar down the picture's start edge: a tick and a label of latitude
 * for each of the view's whole minutes, read downwards. Ticks reach out from
 * the picture, at the collar's end edge, through a nested SVG whose origin is
 * that edge.
 */
function LatitudeCollar({ ticks }: { readonly ticks: readonly PlateTick[] }) {
  return (
    <svg
      className={styles.plateLatitude}
      aria-hidden="true"
      focusable="false"
      data-testid="plate-latitude"
    >
      {ticks.map(({ fraction, label }) => (
        <g key={label}>
          <svg x="100%" overflow="visible" aria-hidden="true" focusable="false">
            <line
              className={styles.plateTick}
              x1={0}
              x2={-TICK_LENGTH}
              y1={percent(fraction)}
              y2={percent(fraction)}
            />
          </svg>
          <text
            className={styles.plateLatitudeLabel}
            x="40%"
            y={percent(fraction)}
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** The collar under the picture: a tick and a label of longitude for each of the view's whole minutes. */
function LongitudeCollar({ ticks }: { readonly ticks: readonly PlateTick[] }) {
  return (
    <svg
      className={styles.plateLongitude}
      aria-hidden="true"
      focusable="false"
      data-testid="plate-longitude"
    >
      {ticks.map(({ fraction, label }) => (
        <g key={label}>
          <line
            className={styles.plateTick}
            x1={percent(fraction)}
            x2={percent(fraction)}
            y1={0}
            y2={TICK_LENGTH}
          />
          <text
            className={styles.plateLongitudeLabel}
            x={percent(fraction)}
            y="60%"
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** The credits under a picture: each credit the map itself shows for its basemaps, linked as the map links them. */
function PlateCredits({ id }: { readonly id: CaptureSubjectId }) {
  const credits = plateCredits(id);
  return (
    <span className={styles.plateCredits}>
      {PLATE_CREDITS_LEAD}{" "}
      {credits.map((credit, index) => (
        <span key={credit.text}>
          <a className={styles.link} href={credit.href}>
            {credit.text}
          </a>
          {index < credits.length - 1 ? ", " : "."}
        </span>
      ))}
    </span>
  );
}

/** The link that opens the live playground over the view a picture shows, when the picture has one. */
function PlateLive({ id }: { readonly id: CaptureSubjectId }) {
  const live = plateLiveLink(id);
  if (live === undefined) {
    return null;
  }
  return (
    <a className={styles.plateLive} href={live.href}>
      {live.text}
    </a>
  );
}

/**
 * A picture of the running playground, set on a survey sheet: the capture in
 * a neatline, with a collar of latitude and longitude ticks worked out from
 * the view the capture shows (`plateGeometry.ts`), and a caption that credits
 * the map. Each theme has its own image, lazy, with its size in attributes so
 * nothing shifts; the one for the other theme is not drawn (`display: none`),
 * so the browser never fetches it, and the page's theme chooses between them
 * with CSS alone.
 */
export function ProductPlate({ id }: { readonly id: CaptureSubjectId }) {
  const subject = captureSubject(id);
  const { longitudeTicks, latitudeTicks } = plateGeometry({
    ...subject.view,
    width: subject.width,
    height: subject.height,
  });
  return (
    <figure className={styles.plate} data-testid={`plate-${id}`}>
      <div className={styles.plateSheet}>
        <div className={styles.plateFrame}>
          {CAPTURE_THEMES.map((theme) => (
            <img
              key={theme}
              className={`${styles.plateImage} ${THEME_CLASS[theme]}`}
              src={PICTURES[id][theme]}
              width={subject.width}
              height={subject.height}
              alt={plateAlt(id, theme)}
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
        <LatitudeCollar ticks={latitudeTicks} />
        <LongitudeCollar ticks={longitudeTicks} />
      </div>
      <PlateLive id={id} />
      <figcaption className={styles.plateCaption}>
        <span>
          {PLATES[id].caption} {plateBasemaps(id)}
        </span>
        <PlateCredits id={id} />
      </figcaption>
    </figure>
  );
}
