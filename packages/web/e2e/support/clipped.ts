// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";

/**
 * Finds text the page shows cut off: words that run past an ancestor that
 * clips its overflow (`hidden` or `clip`, as an ellipsis or a line clamp
 * does). A field's placeholder is not text of an element, so
 * {@link findClippedPlaceholders} reads those. The
 * collision check finds boxes that overlap; a longer translation can also
 * lose meaning without any box touching another, as a label that ends in an
 * ellipsis does. An ancestor that scrolls is not clipping, so the walk up from
 * the text stops there. Text the page hides on purpose (an element that is not
 * visible, a one-pixel visually hidden one) and the map canvas are left out.
 *
 * Each entry names the cut text, where it is cut and by how many pixels.
 */
export function findClippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const TOLERANCE_PX = 1;
    const nameOf = (element: Element) =>
      element.getAttribute("data-testid") ??
      element.getAttribute("data-chrome") ??
      `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}`;
    const ownText = (element: Element) =>
      [...element.childNodes]
        .filter(
          (node): node is Text =>
            node.nodeType === Node.TEXT_NODE &&
            (node.textContent ?? "").trim() !== "",
        )
        .map((node) => node.textContent ?? "")
        .join(" ")
        .trim();
    const textRect = (element: Element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    };
    const clips = (value: string) => value === "hidden" || value === "clip";
    const isChecked = (element: Element) =>
      !element.closest(".maplibregl-map") &&
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLScriptElement) &&
      !(element instanceof HTMLStyleElement);
    const isShown = (element: Element) => {
      const box = element.getBoundingClientRect();
      return (
        box.width > TOLERANCE_PX &&
        box.height > TOLERANCE_PX &&
        element.checkVisibility({ checkVisibilityCSS: true })
      );
    };
    /** The first clipping ancestor, if any, that cuts `shown`, and by how much. */
    const cutBy = (element: Element, shown: DOMRect) => {
      for (
        let ancestor: Element | null = element;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);
        if (
          [style.overflowX, style.overflowY].some((v) => /auto|scroll/.test(v))
        ) {
          return undefined;
        }
        const edge = ancestor.getBoundingClientRect();
        const across = Math.max(
          shown.right - edge.right,
          edge.left - shown.left,
        );
        const down = Math.max(shown.bottom - edge.bottom, edge.top - shown.top);
        const pixels = Math.max(
          clips(style.overflowX) ? across : 0,
          clips(style.overflowY) ? down : 0,
        );
        if (pixels > TOLERANCE_PX) {
          return { ancestor, pixels };
        }
      }
      return undefined;
    };
    const clipped: string[] = [];

    for (const element of document.querySelectorAll("body *")) {
      const text = isChecked(element) ? ownText(element) : "";
      if (text === "" || !isShown(element)) {
        continue;
      }
      const cut = cutBy(element, textRect(element));
      if (cut) {
        clipped.push(
          `"${text.slice(0, 60)}" in ${nameOf(element)} is cut by ${nameOf(cut.ancestor)} (${Math.round(cut.pixels)}px)`,
        );
      }
    }
    return clipped;
  });
}

/**
 * Finds an empty text field whose placeholder does not fit its box, so the
 * text ends in an ellipsis. Each entry names the field and by how many pixels
 * the placeholder is too long.
 */
export function findClippedPlaceholders(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const TOLERANCE_PX = 1;
    const clipped: string[] = [];
    const nameOf = (element: Element) =>
      element.getAttribute("data-testid") ?? element.tagName.toLowerCase();
    for (const input of document.querySelectorAll("input[placeholder]")) {
      const field = input as HTMLInputElement;
      if (
        field.value !== "" ||
        field.placeholder === "" ||
        !field.checkVisibility({ checkVisibilityCSS: true })
      ) {
        continue;
      }
      const style = getComputedStyle(field);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) {
        continue;
      }
      context.font = style.font;
      const needed = context.measureText(field.placeholder).width;
      const room =
        field.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      if (needed - room > TOLERANCE_PX) {
        clipped.push(
          `placeholder "${field.placeholder.slice(0, 60)}" in ${nameOf(field)} is cut (${Math.round(needed - room)}px)`,
        );
      }
    }
    return clipped;
  });
}
