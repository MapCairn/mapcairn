// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";

/**
 * Finds content that a rounded corner cuts off: text, an icon or a
 * field inside an element that clips its content (`overflow` other than
 * `visible`) and has a rounded corner, where the content reaches into the part
 * of the corner the curve removes. A control that can take focus counts with
 * its focus ring: the ring's furthest point along the diagonal of each corner
 * is tested, since a ring follows the control's own radius.
 *
 * It reads the boxes the browser laid out, so it is the geometry the user
 * sees, not the CSS that produced it. Points less than a pixel inside the
 * curve are let through, for sub-pixel rounding. A message names the clipping
 * element, the corner and the content.
 */
export function findCornerClipping(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const TOLERANCE_PX = 1;
    const RING_WIDTH_PX = 4;
    const DIAGONAL = Math.SQRT1_2;
    const FOCUSABLE =
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const CONTENT = "svg, input, textarea, select";

    interface Corner {
      readonly name: string;
      readonly xSign: 1 | -1;
      readonly ySign: 1 | -1;
      readonly property: string;
    }
    const CORNERS: readonly Corner[] = [
      { name: "top left", xSign: 1, ySign: 1, property: "borderTopLeftRadius" },
      {
        name: "top right",
        xSign: -1,
        ySign: 1,
        property: "borderTopRightRadius",
      },
      {
        name: "bottom left",
        xSign: 1,
        ySign: -1,
        property: "borderBottomLeftRadius",
      },
      {
        name: "bottom right",
        xSign: -1,
        ySign: -1,
        property: "borderBottomRightRadius",
      },
    ];

    /** A corner radius as horizontal and vertical pixels, whatever unit it was written in. */
    const radiusOf = (
      style: CSSStyleDeclaration,
      property: string,
      box: DOMRect,
    ): { x: number; y: number } => {
      const parts = (style as unknown as Record<string, string>)[
        property
      ]?.split(" ") ?? ["0px"];
      const toPx = (part: string | undefined, whole: number): number => {
        if (part === undefined) {
          return 0;
        }
        return part.endsWith("%")
          ? (Number.parseFloat(part) / 100) * whole
          : Number.parseFloat(part);
      };
      return {
        x: Math.min(toPx(parts[0], box.width), box.width / 2),
        y: Math.min(toPx(parts[1] ?? parts[0], box.height), box.height / 2),
      };
    };

    const shown = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        box.width > 0 &&
        box.height > 0
      );
    };

    const nameOf = (element: Element): string => {
      const label =
        element.getAttribute("aria-label") ??
        element.getAttribute("data-testid") ??
        element.getAttribute("data-chrome") ??
        (element.textContent ?? "").trim().slice(0, 30);
      return `${element.tagName.toLowerCase()} "${label}"`;
    };

    const clips = (style: CSSStyleDeclaration): boolean =>
      style.overflowX !== "visible" || style.overflowY !== "visible";

    /** The points of a box that decide whether a corner cuts it. */
    const rectPoints = (box: DOMRect): { x: number; y: number }[] => [
      { x: box.left, y: box.top },
      { x: box.right, y: box.top },
      { x: box.left, y: box.bottom },
      { x: box.right, y: box.bottom },
    ];

    /** The furthest point of a control's focus ring along each corner's diagonal. */
    const ringPoints = (element: Element): { x: number; y: number }[] => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return CORNERS.map((corner) => {
        const radius = radiusOf(style, corner.property, box);
        const anchorX = corner.xSign === 1 ? box.left : box.right;
        const anchorY = corner.ySign === 1 ? box.top : box.bottom;
        const arcX = radius.x * (1 - DIAGONAL);
        const arcY = radius.y * (1 - DIAGONAL);
        const out = RING_WIDTH_PX * DIAGONAL;
        return {
          x: anchorX + corner.xSign * (arcX - out),
          y: anchorY + corner.ySign * (arcY - out),
        };
      });
    };

    const textBoxes = (root: Element): DOMRect[] => {
      const boxes: DOMRect[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node.textContent ?? "").trim() === "") {
          continue;
        }
        const parent = node.parentElement;
        if (parent === null || !shown(parent)) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        boxes.push(...range.getClientRects());
      }
      return boxes;
    };

    interface Point {
      readonly x: number;
      readonly y: number;
    }
    interface RoundedCorner {
      readonly corner: Corner;
      readonly radius: { x: number; y: number };
    }

    const insideBox = (point: Point, box: DOMRect): boolean =>
      point.x >= box.left &&
      point.x <= box.right &&
      point.y >= box.top &&
      point.y <= box.bottom;

    /** Whether a point in the clipper's box is in the part this corner's curve removes. */
    const removedByCorner = (
      point: Point,
      box: DOMRect,
      { corner, radius }: RoundedCorner,
    ): boolean => {
      const centreX =
        corner.xSign === 1 ? box.left + radius.x : box.right - radius.x;
      const centreY =
        corner.ySign === 1 ? box.top + radius.y : box.bottom - radius.y;
      const dx = (point.x - centreX) * corner.xSign;
      const dy = (point.y - centreY) * corner.ySign;
      const slack = TOLERANCE_PX / Math.min(radius.x, radius.y);
      return (
        dx < 0 && dy < 0 && Math.hypot(dx / radius.x, dy / radius.y) > 1 + slack
      );
    };

    /** The name of the corner that cuts a point of the clipper's box, if any. */
    const cuttingCorner = (
      point: Point,
      box: DOMRect,
      corners: readonly RoundedCorner[],
    ): string | undefined =>
      insideBox(point, box)
        ? corners.find((rounded) => removedByCorner(point, box, rounded))
            ?.corner.name
        : undefined;

    /** The content of a clipper to test, each with the points that decide it. */
    const contentOf = (
      clipper: Element,
    ): { what: string; points: Point[] }[] => [
      ...textBoxes(clipper).map((text) => ({
        what: "text",
        points: rectPoints(text),
      })),
      ...[...clipper.querySelectorAll(CONTENT)]
        .filter(shown)
        .map((content) => ({
          what: nameOf(content),
          points: rectPoints(content.getBoundingClientRect()),
        })),
      ...[...clipper.querySelectorAll(FOCUSABLE)]
        .filter(shown)
        .map((control) => ({
          what: `the focus ring of ${nameOf(control)}`,
          points: ringPoints(control),
        })),
    ];

    /** The corners of a clipper that are rounded, with their radii. */
    const roundedCornersOf = (clipper: Element): RoundedCorner[] => {
      const style = getComputedStyle(clipper);
      const box = clipper.getBoundingClientRect();
      return CORNERS.map((corner) => ({
        corner,
        radius: radiusOf(style, corner.property, box),
      })).filter(({ radius }) => radius.x > 0 && radius.y > 0);
    };

    const problems: string[] = [];
    for (const clipper of document.querySelectorAll("body *")) {
      if (!clips(getComputedStyle(clipper)) || !shown(clipper)) {
        continue;
      }
      const corners = roundedCornersOf(clipper);
      const box = clipper.getBoundingClientRect();
      for (const { what, points } of contentOf(clipper)) {
        const name = points
          .map((point) => cuttingCorner(point, box, corners))
          .find((found) => found !== undefined);
        if (name !== undefined) {
          problems.push(
            `${nameOf(clipper)} cuts its ${name} corner into ${what}`,
          );
        }
      }
    }
    return [...new Set(problems)];
  });
}
