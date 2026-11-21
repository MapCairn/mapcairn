// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  CAPTURE_THEMES,
  type CaptureSubjectId,
  type CaptureTheme,
  captureSubject,
} from "./captureSubjects";
import heroDark from "./captures/hero-dark.webp";
import heroLight from "./captures/hero-light.webp";
import heroWideDark from "./captures/heroWide-dark.webp";
import heroWideLight from "./captures/heroWide-light.webp";
import * as styles from "./ProductPage.css";
import {
  DEMO_PLATES,
  PLATE_CREDITS_LEAD,
  PLATES,
  plateAlt,
  plateBasemaps,
  plateCredits,
} from "./productContent";

/** The picture of each subject for each theme, as the build serves them from this site. */
const PICTURES: Readonly<
  Record<CaptureSubjectId, Readonly<Record<CaptureTheme, string>>>
> = {
  hero: { light: heroLight, dark: heroDark },
  heroWide: { light: heroWideLight, dark: heroWideDark },
};

/** The class of the image for a theme: the dark one starts hidden and the page's theme shows it (`ProductPage.css.ts`). */
const THEME_CLASS: Readonly<Record<CaptureTheme, string>> = {
  light: styles.plateLight,
  dark: styles.plateDark,
};

/** The class of each size's frame: the narrow one on a phone, the wide one from the tablet width. */
const SIZE_CLASS = {
  narrow: styles.plateNarrow,
  wide: styles.plateWide,
} as const;

/** The credits under the picture: each credit the map itself shows for its basemaps, linked as the map links them. */
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

/**
 * One size of the picture: its image for each theme in a frame. Each image is
 * lazy, with its size in attributes so nothing shifts; the one for the other
 * theme, and the frame of the other size, are not drawn (`display: none`), so
 * the browser fetches one file.
 */
function PlateFrame({ size }: { readonly size: keyof typeof DEMO_PLATES }) {
  const id = DEMO_PLATES[size];
  const subject = captureSubject(id);
  return (
    <div
      className={`${styles.plateFrame} ${SIZE_CLASS[size]}`}
      data-testid={`plate-${id}`}
    >
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
  );
}

/**
 * The playground at work, straight under the hero and the largest picture on
 * the page: one view captured at two sizes, the narrow one edge to edge on a
 * phone and the wide one at the column's width from the tablet width, chosen
 * by CSS alone, as each theme's picture is. The caption says what it shows,
 * its basemaps and the map's credits, which are the same for both sizes.
 */
export function DemoFigure() {
  return (
    <figure className={styles.demo} data-testid="demo">
      <PlateFrame size="narrow" />
      <PlateFrame size="wide" />
      <figcaption className={styles.plateCaption}>
        <span>
          {PLATES[DEMO_PLATES.wide].caption} {plateBasemaps(DEMO_PLATES.wide)}
        </span>
        <PlateCredits id={DEMO_PLATES.wide} />
      </figcaption>
    </figure>
  );
}
