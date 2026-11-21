// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { contrastRatio, parseColour, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "../constants/siteConfig";
import { HEADLINE } from "./productContent";
import {
  PLAYGROUND_CARD,
  PRODUCT_CARD,
  SHARE_CARD_LAYOUT,
  SHARE_CARD_SCALE,
  shareCardCrop,
  shareCardHtml,
  shareCardInks,
  shareCardLabels,
} from "./shareCard";
import {
  CAIRN_BOX,
  MEASURE_LABEL,
  PIN_BOX,
  placeIn,
  SPOT_HEIGHT,
} from "./surveyGeometry";

const INKS = shareCardInks({
  roles: tokenValues.themeValues.light.opaque,
  accent: tokenValues.accent,
});

const ASSETS = { fontUrl: "file:///font.woff2", markUrl: "file:///mark.svg" };

/** Whether a point lies inside the crop's box. */
function inCrop(point: { x: number; y: number }): boolean {
  const { box } = shareCardCrop();
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

describe("the link preview cards' words", () => {
  it("says the product page's own headline, so the card cannot drift from the h1", () => {
    expect(PRODUCT_CARD.headline).toBe(HEADLINE);
  });

  it("gives the playground a line of its own", () => {
    expect(PLAYGROUND_CARD.headline).not.toBe(PRODUCT_CARD.headline);
    expect(PLAYGROUND_CARD.lede.length).toBeGreaterThan(0);
  });
});

describe("the link preview cards' look", () => {
  const paper = parseColour(INKS.paper);

  it.each([
    ["text", INKS.text],
    ["muted text", INKS.muted],
    ["link text", INKS.link],
  ])("sets %s on the paper at 4.5:1 or more", (_name, ink) => {
    expect(contrastRatio(parseColour(ink), paper)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["the survey marks", INKS.mark],
    ["the neatline", INKS.neatline],
  ])("sets %s on the paper at 3:1 or more", (_name, ink) => {
    expect(contrastRatio(parseColour(ink), paper)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the headline readable at 300 px wide", () => {
    const thumbnail = SHARE_CARD_LAYOUT.headlineSize * (300 / OG_IMAGE_WIDTH);
    expect(thumbnail).toBeGreaterThanOrEqual(15);
  });

  it("keeps the figures on the survey sheet readable at 300 px wide", () => {
    const thumbnail = SHARE_CARD_LAYOUT.figureSize * (300 / OG_IMAGE_WIDTH);
    expect(thumbnail).toBeGreaterThanOrEqual(5);
  });

  it("draws the cairn at least as large as the page's relief strip does, in card pixels", () => {
    const widthPx =
      (CAIRN_BOX.right - CAIRN_BOX.left) * SHARE_CARD_SCALE.pixelsPerUnit;
    expect(widthPx).toBeGreaterThanOrEqual(60);
  });
});

describe("the survey sheet on the cards", () => {
  it("fits inside the card with the margin kept on every side", () => {
    const { plate } = SHARE_CARD_LAYOUT;
    expect(plate.left + plate.width).toBeLessThanOrEqual(
      OG_IMAGE_WIDTH - SHARE_CARD_LAYOUT.margin,
    );
    expect(plate.top).toBeGreaterThanOrEqual(SHARE_CARD_LAYOUT.margin);
    expect(plate.top + plate.height).toBeLessThanOrEqual(
      OG_IMAGE_HEIGHT - SHARE_CARD_LAYOUT.margin,
    );
  });

  it("crops the sheet to the plate's own shape, so nothing is stretched", () => {
    const { plate } = SHARE_CARD_LAYOUT;
    expect(shareCardCrop().aspect).toBeCloseTo(plate.width / plate.height, 6);
  });

  it("shows the pin, the cairn and both figures", () => {
    for (const box of [PIN_BOX, CAIRN_BOX]) {
      expect(inCrop({ x: box.left, y: box.top })).toBe(true);
      expect(inCrop({ x: box.right, y: box.bottom })).toBe(true);
    }
    expect(inCrop(SPOT_HEIGHT.at)).toBe(true);
    expect(inCrop(MEASURE_LABEL.at)).toBe(true);
  });

  it("scales the sheet by one number: the plate's width over the crop's", () => {
    const { box } = shareCardCrop();
    expect(SHARE_CARD_SCALE.pixelsPerUnit).toBeCloseTo(
      SHARE_CARD_LAYOUT.plate.width / (box.right - box.left),
      6,
    );
  });

  it("writes the figures the page's relief strip writes", () => {
    const labels = shareCardLabels();
    expect(labels.map(({ text }) => text)).toEqual([
      SPOT_HEIGHT.text,
      MEASURE_LABEL.text,
    ]);
  });

  it("keeps the spot height before the cairn and the length below the line's middle, inside the plate", () => {
    const { plate } = SHARE_CARD_LAYOUT;
    const [spot, length] = shareCardLabels();
    const cairnLeft = placeIn(shareCardCrop(), {
      x: CAIRN_BOX.left,
      y: CAIRN_BOX.top,
    }).inline;
    expect(spot?.place).toBe("before");
    expect(spot?.x).toBeLessThan(cairnLeft * plate.width);
    const middle = placeIn(shareCardCrop(), MEASURE_LABEL.at);
    expect(length?.place).toBe("after");
    expect(length?.x).toBeGreaterThan(middle.inline * plate.width);
    expect(length?.y).toBeGreaterThan(middle.block * plate.height);
    for (const label of [spot, length]) {
      expect(label?.x).toBeGreaterThan(0);
      expect(label?.x).toBeLessThan(plate.width);
      expect(label?.y).toBeGreaterThan(0);
      expect(label?.y).toBeLessThan(plate.height);
    }
  });
});

describe("the link preview cards' markup", () => {
  it("sizes the page to the card's meta tags", () => {
    const html = shareCardHtml(PRODUCT_CARD, ASSETS, INKS);
    expect(html).toContain(`width: ${OG_IMAGE_WIDTH}px`);
    expect(html).toContain(`height: ${OG_IMAGE_HEIGHT}px`);
  });

  it("holds the headline, the lede and the address of the site", () => {
    const html = shareCardHtml(PRODUCT_CARD, ASSETS, INKS);
    expect(html).toContain(PRODUCT_CARD.headline);
    expect(html).toContain(PRODUCT_CARD.lede);
    expect(html).toContain("mapcairn.");
  });

  it("escapes words, so a character in them cannot break the markup", () => {
    const html = shareCardHtml(
      { headline: "Maps <b>&</b>", lede: 'A "lede"' },
      ASSETS,
      INKS,
    );
    expect(html).toContain("Maps &lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).not.toContain("<b>&</b>");
  });

  it("draws both cards from one layout, so they differ only in their words", () => {
    const strip = (html: string, card: typeof PRODUCT_CARD) =>
      html.replace(card.headline, "").replace(card.lede, "");
    expect(strip(shareCardHtml(PRODUCT_CARD, ASSETS, INKS), PRODUCT_CARD)).toBe(
      strip(shareCardHtml(PLAYGROUND_CARD, ASSETS, INKS), PLAYGROUND_CARD),
    );
  });

  it("draws no second hue: every colour is one of the card's inks", () => {
    const html = shareCardHtml(PRODUCT_CARD, ASSETS, INKS);
    const allowed = new Set<string>(Object.values(INKS));
    const used = html.match(/(?:#[0-9a-f]{3,8}\b|oklch\([^)]*\))/gi) ?? [];
    expect(used.length).toBeGreaterThan(0);
    for (const colour of used) {
      expect(allowed.has(colour)).toBe(true);
    }
  });

  it("loads nothing from the network", () => {
    const html = shareCardHtml(PRODUCT_CARD, ASSETS, INKS);
    expect(html).not.toMatch(/https?:\/\/(?!mapcairn)/);
  });
});
