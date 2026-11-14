// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** The axe rule tags every page must pass: WCAG 2.0, 2.1 and 2.2 A and AA, plus best practice. */
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

/**
 * Runs axe over the whole page with {@link AXE_TAGS} and no rule disabled,
 * and returns one line per violating node, so an assertion shows what failed.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact}): ${node.target.join(" ")} :: ${node.failureSummary?.replace(/\s+/g, " ")}`,
    ),
  );
}

/** Findings from {@link inspectControls}. Each list is empty when the page is sound. */
export interface ControlReport {
  /** Interactive elements with no accessible name. */
  readonly unnamed: readonly string[];
  /** Elements with a tabindex above 0. */
  readonly positiveTabindex: readonly string[];
  /** Targets smaller than 24 by 24 CSS pixels (WCAG 2.5.8). */
  readonly tooSmall: readonly string[];
  /** Targets at least 24 but under 44 pixels on a side, which DESIGN.md aims to avoid. */
  readonly under44: readonly string[];
}

/**
 * Checks what axe cannot see on its own, over every interactive element that
 * is shown and not inert:
 *
 * - each has an accessible name (from `aria-label`, `aria-labelledby`, a
 *   label, `alt`, `title` or its text);
 * - nothing has a tabindex above 0;
 * - each target is at least 24 by 24 pixels. A visually hidden native input
 *   inside a label (the basemap tiles) is measured by its label, which is
 *   what the pointer hits. Links inside running text are exempt, as WCAG
 *   2.5.8 allows.
 */
export function inspectControls(page: Page): Promise<ControlReport> {
  return page.evaluate(() => {
    const INTERACTIVE = [
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "[tabindex]",
      '[role="button"]',
      '[role="link"]',
      '[role="switch"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="option"]',
      '[role="combobox"]',
      '[role="slider"]',
      '[role="tab"]',
    ].join(",");
    const describeElement = (element: Element) => {
      const id = element.id ? `#${element.id}` : "";
      const testId = element.getAttribute("data-testid");
      return `${element.tagName.toLowerCase()}${id}${testId ? `[data-testid=${testId}]` : ""} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"`;
    };
    const textOf = (ids: string) =>
      ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
    const nameOf = (element: HTMLElement) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy && textOf(labelledBy)) {
        return textOf(labelledBy);
      }
      const label = element.getAttribute("aria-label")?.trim();
      if (label) {
        return label;
      }
      // Every labelable element (a button too, as Radix switches are) takes
      // its name from a <label for>.
      if ("labels" in element && element.labels instanceof NodeList) {
        const labels = [...(element.labels as NodeListOf<HTMLLabelElement>)]
          .map((entry) => entry.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (labels) {
          return labels;
        }
      }
      const alt = [...element.querySelectorAll("img[alt]")]
        .map((image) => image.getAttribute("alt"))
        .join(" ")
        .trim();
      return (
        element.textContent?.trim() ||
        alt ||
        element.getAttribute("title") ||
        ""
      );
    };
    const shown = (element: HTMLElement) =>
      element.closest("[inert], [hidden], [aria-hidden='true']") === null &&
      element.checkVisibility({ visibilityProperty: true });

    /**
     * Whether an element is a control a person operates: shown, and either in
     * the Tab order or a listbox option. Headings and regions that script
     * focuses (tabindex -1) are not controls.
     */
    const isControl = (element: HTMLElement) =>
      shown(element) &&
      (element.tabIndex >= 0 || element.getAttribute("role") === "option");
    /**
     * The box the pointer hits, or null when there is nothing to measure: a
     * visually hidden native input is measured by its label, and an element
     * hidden until focused (the skip link) or a link in running text is skipped.
     */
    const targetBox = (element: HTMLElement): DOMRect | null => {
      const own = element.getBoundingClientRect();
      const label = element.closest("label");
      const tiny = (rect: DOMRect) => rect.width <= 2 && rect.height <= 2;
      const box = tiny(own) && label ? label.getBoundingClientRect() : own;
      const inRunningText =
        element.matches("a[href]") && element.closest("p") !== null;
      return tiny(box) || inRunningText ? null : box;
    };

    const controls = [
      ...document.querySelectorAll<HTMLElement>(INTERACTIVE),
    ].filter(isControl);
    const unnamed = controls
      .filter((element) => !nameOf(element))
      .map(describeElement);
    const positiveTabindex = [
      ...document.querySelectorAll<HTMLElement>("[tabindex]"),
    ]
      .filter((element) => element.tabIndex > 0)
      .map(describeElement);
    const tooSmall: string[] = [];
    const under44: string[] = [];
    for (const element of controls) {
      const box = targetBox(element);
      if (!box) {
        continue;
      }
      const size = `${describeElement(element)} is ${Math.round(box.width)}x${Math.round(box.height)}`;
      if (box.width < 24 || box.height < 24) {
        tooSmall.push(size);
      } else if (box.width < 44 || box.height < 44) {
        under44.push(size);
      }
    }
    return { unnamed, positiveTabindex, tooSmall, under44 };
  });
}

/**
 * Tabs through the page from the top and reports every element that takes
 * keyboard focus without a visible focus indicator: no outline (style other
 * than none and width of at least 2px) and no box shadow. Stops when focus
 * comes back round or after `limit` presses.
 */
export async function findMissingFocusRings(
  page: Page,
  limit = 80,
): Promise<{ readonly visited: number; readonly missing: string[] }> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.getSelection()?.removeAllRanges();
  });
  const missing: string[] = [];
  const seen = new Set<string>();
  let visited = 0;
  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) {
        return null;
      }
      const path: string[] = [];
      for (
        let node: Element | null = element;
        node && node !== document.body;
        node = node.parentElement
      ) {
        path.unshift(
          `${node.tagName}${[...(node.parentElement?.children ?? [])].indexOf(node)}`,
        );
      }
      // A ring may be drawn on the element or on its ::after layer (the map
      // region draws it there, above the engine canvas). A slider thumb's box
      // and a switch's box are their 44px hit areas, so `Slider` rings the
      // visible circle inside it and `Switch` rings the visible track.
      const ringed = (style: CSSStyleDeclaration) =>
        (style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) >= 2) ||
        (style.boxShadow !== "none" && style.boxShadow !== "");
      const role = element.getAttribute("role");
      const innerVisual =
        role === "slider" || role === "switch"
          ? element.firstElementChild
          : null;
      return {
        key: path.join("/"),
        label: `${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"`,
        visible:
          ringed(getComputedStyle(element)) ||
          ringed(getComputedStyle(element, "::after")) ||
          (innerVisual !== null && ringed(getComputedStyle(innerVisual))),
      };
    });
    if (focused === null) {
      continue;
    }
    if (seen.has(focused.key)) {
      break;
    }
    seen.add(focused.key);
    visited += 1;
    if (!focused.visible) {
      missing.push(focused.label);
    }
  }
  return { visited, missing };
}

/**
 * Every element on the page whose transition or animation lasts longer than
 * the reduced-motion duration (0.01ms), as `selector: duration`.
 */
export function findLongMotion(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const longest = (value: string) =>
      Math.max(
        0,
        ...value.split(",").map((part) => {
          const number = Number.parseFloat(part);
          return part.trim().endsWith("ms") ? number / 1000 : number;
        }),
      );
    const found: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const style = getComputedStyle(element);
      const transition = longest(style.transitionDuration);
      const animation =
        style.animationName === "none" ? 0 : longest(style.animationDuration);
      if (transition > 0.001 || animation > 0.001) {
        found.push(
          `${element.tagName.toLowerCase()}.${element.className.toString().split(" ")[0]}: ${Math.max(transition, animation)}s`,
        );
      }
    }
    return found;
  });
}
