// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { STONES } from "../app/cairnStones";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_URL,
} from "../constants/siteConfig";
import { CONTOURS } from "./contours";
import {
  CAIRN_BOX,
  CAIRN_TRANSFORM,
  type Crop,
  cropOf,
  EASTINGS,
  MEASURE,
  MEASURE_LABEL,
  NORTHINGS,
  PIN_BOX,
  PIN_HEAD,
  PIN_PATH,
  PIN_TIP,
  placeIn,
  SPOT_HEIGHT,
} from "./surveyGeometry";

/*
 * The link preview cards. Both are one survey sheet: warm paper, ink type, and
 * the product page's relief strip as a plate with a neatline and grid ticks,
 * its pin, measured line and cairn in the logo's blue (a graphic colour, never
 * text). The product page's card and the playground's differ only in their two
 * lines of words, so a link to either reads as the same site.
 * `scripts/generateSdkOgImage.ts` and `scripts/generateOgImage.ts` give this
 * module's markup to a browser and keep its screenshot. The geometry is the
 * page's own (`surveyGeometry.ts`), the colours are the light theme's token
 * values, and `shareCard.test.ts` holds the contrast, the sizes and the
 * agreement between the two cards.
 */

/** The words on one card. */
export interface ShareCardWords {
  readonly headline: string;
  readonly lede: string;
}

/**
 * The product page's card: its own h1 and a one-line summary. The headline is
 * `HEADLINE` in `productContent.ts`, which `shareCard.test.ts` holds it to;
 * that file cannot be loaded outside Vite, so the card cannot import it.
 */
export const PRODUCT_CARD: ShareCardWords = {
  headline: "Accessible map interfaces for the public",
  lede: "An open-source React SDK for public-interest maps.",
};

/** The playground's card: what the map offers, in the site's own words. */
export const PLAYGROUND_CARD: ShareCardWords = {
  headline: "The MapCairn playground",
  lede: "Search places, compare basemaps and measure distances or areas.",
};

/** The files the markup refers to, as absolute URLs. */
export interface ShareCardAssets {
  /** The IBM Plex Sans variable font file. */
  readonly fontUrl: string;
  /** The brand mark, `public/favicon.svg`, so the card cannot drift from the icon. */
  readonly markUrl: string;
}

/** Every colour on the cards. */
export interface ShareCardInks {
  readonly paper: string;
  readonly text: string;
  readonly muted: string;
  readonly link: string;
  readonly mark: string;
  readonly neatline: string;
}

/** The theme values the cards' inks are taken from. */
export interface ShareCardTheme {
  readonly roles: {
    readonly pageBackground: string;
    readonly text: string;
    readonly textMuted: string;
    readonly controlBoundary: string;
  };
  readonly accent: Readonly<Record<600 | 700, string>>;
}

/**
 * The cards' inks from the light theme's own values, and no other: the paper,
 * the text, the muted text, the link ink, the survey marks (the logo's blue)
 * and the neatline. The values are passed in because the theme's barrel cannot
 * be loaded by `tsx` (it holds vanilla-extract style files), so the generator
 * reads `tokenValues.ts` itself and the test reads the barrel.
 */
export function shareCardInks({
  roles,
  accent,
}: ShareCardTheme): ShareCardInks {
  return {
    paper: roles.pageBackground,
    text: roles.text,
    muted: roles.textMuted,
    link: accent[700],
    mark: accent[600],
    neatline: roles.controlBoundary,
  };
}

/** Where everything stands on the 1200 by 630 card, in pixels. */
export const SHARE_CARD_LAYOUT = {
  /** Clear space between the card's edge and its content. */
  margin: 72,
  /** The survey plate at the card's end edge. */
  plate: { left: 664, top: 72, width: 464, height: 486 },
  headlineSize: 68,
  ledeSize: 30,
  /** The two figures on the plate and the address. */
  figureSize: 24,
  markSize: 76,
  brandSize: 38,
  /** The neatline and the grid's ticks. */
  neatlineWidth: 2,
  tickLength: 12,
  tickWidth: 2,
} as const;

/** The clear space round the marks that the plate's crop keeps, in view box units. */
const CROP_MARGIN = 20;

/** The crop of the sheet the plate shows: the marks, centred, in the plate's own shape. */
export function shareCardCrop(): Crop {
  const { plate } = SHARE_CARD_LAYOUT;
  const width = CAIRN_BOX.right - PIN_BOX.left + 2 * CROP_MARGIN;
  const height = (width * plate.height) / plate.width;
  const left = PIN_BOX.left - CROP_MARGIN;
  const middle = (Math.min(CAIRN_BOX.top, PIN_BOX.top) + PIN_BOX.bottom) / 2;
  return cropOf({
    left,
    right: left + width,
    top: middle - height / 2,
    bottom: middle + height / 2,
  });
}

/** How many card pixels one view box unit is on the plate. */
export const SHARE_CARD_SCALE = {
  pixelsPerUnit:
    SHARE_CARD_LAYOUT.plate.width /
    (shareCardCrop().box.right - shareCardCrop().box.left),
} as const;

/** How far a figure keeps from the mark it names, in card pixels. */
const LABEL_GAP = 12;

/** A figure on the plate, placed in the plate's own pixels. */
export interface ShareCardLabel {
  readonly text: string;
  /** `before`: the label's end edge is at `x` and its middle at `y`. `after`: its top start corner is at `x`, `y`. */
  readonly place: "before" | "after";
  readonly x: number;
  readonly y: number;
}

/** A point of the sheet, in the plate's pixels. */
function onPlate(point: { x: number; y: number }): { x: number; y: number } {
  const { plate } = SHARE_CARD_LAYOUT;
  const { inline, block } = placeIn(shareCardCrop(), point);
  return { x: inline * plate.width, y: block * plate.height };
}

/**
 * The summit's height, before the cairn and level with its middle, and the
 * line's length, a step after and below the line's middle, where the line (which
 * rises as it goes on) passes above it: the page's own rules, in card pixels.
 */
export function shareCardLabels(): readonly ShareCardLabel[] {
  const spot = onPlate(SPOT_HEIGHT.at);
  const length = onPlate(MEASURE_LABEL.at);
  return [
    {
      text: SPOT_HEIGHT.text,
      place: "before",
      x: spot.x - LABEL_GAP,
      y: spot.y,
    },
    {
      text: MEASURE_LABEL.text,
      place: "after",
      x: length.x + LABEL_GAP,
      y: length.y + LABEL_GAP / 2,
    },
  ];
}

/** The cairn's stones, in the marks' blue, with the paper's halo between them. */
function cairn(inks: ShareCardInks): string {
  const stones = STONES.map(
    ({ points, offset }) =>
      `<g transform="${offset ?? ""}"><polygon points="${points}" fill="${inks.paper}" stroke="${inks.paper}" stroke-width="40" stroke-linejoin="round"/><polygon points="${points}" fill="${inks.mark}" stroke="${inks.mark}" stroke-width="16" stroke-linejoin="round"/></g>`,
  ).join("");
  return `<g transform="${CAIRN_TRANSFORM}">${stones}</g>`;
}

/** The contours, the measured line, the cairn and the pin, in the crop's view box. */
function plateArt(inks: ShareCardInks): string {
  const { box } = shareCardCrop();
  const contours = CONTOURS.map(
    ({ index, d }) =>
      `<path d="${d}" fill="none" stroke="${inks.muted}" stroke-opacity="${index ? 0.6 : 0.3}" stroke-width="${index ? 2 : 1.25}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`,
  ).join("");
  const line = `<line x1="${MEASURE.from.x}" y1="${MEASURE.from.y}" x2="${MEASURE.to.x}" y2="${MEASURE.to.y}" stroke="${inks.mark}" stroke-width="3" vector-effect="non-scaling-stroke" stroke-dasharray="7 6" stroke-linecap="round"/>`;
  const pin = `<g transform="translate(${PIN_TIP.x} ${PIN_TIP.y})"><path d="${PIN_PATH}" fill="${inks.mark}" stroke="${inks.paper}" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${PIN_HEAD.cx}" cy="${PIN_HEAD.cy}" r="${PIN_HEAD.r}" fill="${inks.paper}"/></g>`;
  return `<svg viewBox="${box.left} ${box.top} ${box.right - box.left} ${box.bottom - box.top}" width="${SHARE_CARD_LAYOUT.plate.width}" height="${SHARE_CARD_LAYOUT.plate.height}" aria-hidden="true">${contours}${line}${cairn(inks)}${pin}</svg>`;
}

/** The grid's ticks inside the plate's top and start edges, where the sheet's grid lines cross the crop. */
function plateTicks(inks: ShareCardInks): string {
  const { box } = shareCardCrop();
  const { plate, tickLength, tickWidth } = SHARE_CARD_LAYOUT;
  const east = EASTINGS.filter(({ at }) => at > box.left && at < box.right).map(
    ({ at }) => {
      const x = onPlate({ x: at, y: box.top }).x;
      return `<line x1="${x}" y1="0" x2="${x}" y2="${tickLength}"/>`;
    },
  );
  const north = NORTHINGS.filter(
    ({ at }) => at > box.top && at < box.bottom,
  ).map(({ at }) => {
    const y = onPlate({ x: box.left, y: at }).y;
    return `<line x1="0" y1="${y}" x2="${tickLength}" y2="${y}"/>`;
  });
  return `<svg width="${plate.width}" height="${plate.height}" aria-hidden="true" stroke="${inks.muted}" stroke-width="${tickWidth}">${[...east, ...north].join("")}</svg>`;
}

/** Words as text in markup. */
function escapeText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** One figure, as a positioned span on the plate. */
function labelHtml({ text, place, x, y }: ShareCardLabel): string {
  const className = place === "before" ? "figure before" : "figure after";
  return `<span class="${className}" style="left: ${x.toFixed(1)}px; top: ${y.toFixed(1)}px">${escapeText(text)}</span>`;
}

/** The address of the site, without its scheme. */
const URL_LABEL = SITE_URL.replace(/^https?:\/\//, "");

/**
 * The whole card as one HTML page, sized to the card, for a browser to
 * screenshot.
 * @param words - The headline and the lede, the only parts that differ.
 * @param assets - The font and the brand mark, as URLs the browser can load.
 * @param inks - The colours, from {@link shareCardInks}.
 */
export function shareCardHtml(
  words: ShareCardWords,
  assets: ShareCardAssets,
  inks: ShareCardInks,
): string {
  const { margin, plate, headlineSize, ledeSize, figureSize, markSize } =
    SHARE_CARD_LAYOUT;
  const textWidth = plate.left - margin * 2;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: "IBM Plex Sans Variable";
    src: url("${assets.fontUrl}") format("woff2");
    font-weight: 100 700;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    position: relative;
    overflow: hidden;
    width: ${OG_IMAGE_WIDTH}px;
    height: ${OG_IMAGE_HEIGHT}px;
    background: ${inks.paper};
    color: ${inks.text};
    font-family: "IBM Plex Sans Variable", sans-serif;
  }
  .words {
    position: absolute;
    left: ${margin}px;
    top: ${margin}px;
    bottom: ${margin}px;
    width: ${textWidth}px;
    display: flex;
    flex-direction: column;
  }
  .brand { display: flex; align-items: center; gap: 20px; font-size: ${SHARE_CARD_LAYOUT.brandSize}px; font-weight: 600; letter-spacing: -0.01em; }
  .brand img { display: block; width: ${markSize}px; height: ${markSize}px; border-radius: 22%; }
  h1 { margin-top: 48px; font-size: ${headlineSize}px; line-height: 1.08; letter-spacing: -0.025em; font-weight: 600; text-wrap: balance; }
  .lede { margin-top: 28px; font-size: ${ledeSize}px; line-height: 1.35; color: ${inks.muted}; text-wrap: balance; }
  .url { margin-top: auto; padding-top: 24px; font-size: ${figureSize + 4}px; font-weight: 600; color: ${inks.link}; }
  .plate {
    position: absolute;
    left: ${plate.left}px;
    top: ${plate.top}px;
    width: ${plate.width}px;
    height: ${plate.height}px;
    overflow: hidden;
  }
  .plate::after {
    content: "";
    position: absolute;
    inset: 0;
    border: ${SHARE_CARD_LAYOUT.neatlineWidth}px solid ${inks.neatline};
  }
  .plate svg { position: absolute; left: 0; top: 0; display: block; }
  .figure {
    position: absolute;
    padding: 0 6px;
    background: ${inks.paper};
    color: ${inks.text};
    font-size: ${figureSize}px;
    font-weight: 600;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .figure.before { transform: translate(-100%, -50%); }
</style>
</head>
<body>
  <div class="words">
    <div class="brand"><img src="${assets.markUrl}" alt="" />MapCairn</div>
    <h1>${escapeText(words.headline)}</h1>
    <p class="lede">${escapeText(words.lede)}</p>
    <p class="url">${URL_LABEL}</p>
  </div>
  <div class="plate">${plateArt(inks)}${plateTicks(inks)}${shareCardLabels().map(labelHtml).join("")}</div>
</body>
</html>`;
}
