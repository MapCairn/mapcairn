// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** The axe rule tags every page must pass, as the reference host's accessibility tests use. */
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

/** The two themes the site offers, set through the system colour scheme. */
export const THEMES = ["light", "dark"] as const;

/** A theme the site offers. */
export type Theme = (typeof THEMES)[number];

/** The widths the audits run at: the smallest phone, a phone and a desktop. */
export const AUDIT_WIDTHS = [320, 390, 1280] as const;

/** Viewport height used for every check. */
export const VIEWPORT_HEIGHT = 800;

/** One page of the site the audit visits, by a name and a path on the site. */
export interface AuditedPage {
  readonly name: string;
  readonly path: string;
}

/**
 * The pages audited: Get started, a task page, a task page with a long code
 * sample, an API page for a function and
 * one for a type, the roadmap, the Architecture overview, two of its parts (one
 * with many tables, one with a diagram), a Design system part, the visual
 * design page (both themes drawn at once, whatever the reader chose), the
 * extending guide (a diagram), the layer definitions guide (tables and long
 * code samples) and the 404 page (which the static server answers for an
 * unknown address).
 */
export const AUDITED_PAGES: readonly AuditedPage[] = [
  { name: "Get started", path: "/" },
  { name: "task page", path: "/tasks/choose-a-basemap/" },
  {
    name: "task page with a long sample",
    path: "/tasks/follow-the-system-theme/",
  },
  { name: "API function", path: "/api/core/addStop/" },
  { name: "API type", path: "/api/core/ClipboardPort/" },
  { name: "roadmap", path: "/roadmap/" },
  { name: "Architecture overview", path: "/architecture/" },
  { name: "Architecture part", path: "/architecture/ports-part-1/" },
  {
    name: "Architecture diagram part",
    path: "/architecture/data-layers/",
  },
  { name: "Design part", path: "/design/tokens/" },
  { name: "Design tokens, visually", path: "/design/visual-tokens/" },
  { name: "Extend the SDK", path: "/guides/extending/" },
  { name: "Layer definitions", path: "/guides/layer-definitions/" },
  { name: "404", path: "/this-page-does-not-exist/" },
];

/**
 * Sets the colour scheme and viewport before a page loads, with reduced
 * motion so that axe never measures a card half way through its fade-in.
 */
export async function prepare(
  page: Page,
  theme: Theme,
  width: number,
): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
}

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

/**
 * Opens a page and waits until its scripts have run, because the search
 * shortcut and button only work once the page has hydrated.
 */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** A shown header control with its name and box in CSS pixels. */
export interface HeaderTarget {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Every link and button matching `selector` (the header's by default) that is shown, with its box. */
export function headerTargets(
  page: Page,
  selector = "nav.navbar a, nav.navbar button",
): Promise<HeaderTarget[]> {
  return page.evaluate(
    (css) =>
      [...document.querySelectorAll<HTMLElement>(css)]
        .filter((element) =>
          element.checkVisibility({ visibilityProperty: true }),
        )
        .map((element) => {
          const box = element.getBoundingClientRect();
          const name = (
            element.getAttribute("aria-label") ??
            element.textContent ??
            element.className
          )
            .trim()
            .slice(0, 40);
          return {
            name: name || element.tagName.toLowerCase(),
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          };
        }),
    selector,
  );
}

/** How many snapshots in a row must be equal before a layout counts as settled. */
const SETTLED_SNAPSHOTS = 3;

/** How many snapshots to take before giving up on a layout that never settles. */
const MAX_SNAPSHOTS = 60;

/** Resolves after the browser has painted two more frames. */
function nextFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Like {@link headerTargets}, but waits until the boxes stop moving: the
 * framework animates a sidebar category open, and a box measured on the way
 * overlaps its neighbours. It compares snapshots a frame or two apart, so it
 * waits for the layout itself and not for a fixed time.
 */
export async function settledTargets(
  page: Page,
  selector?: string,
): Promise<HeaderTarget[]> {
  let latest = await headerTargets(page, selector);
  let equalInARow = 1;
  for (let taken = 1; taken < MAX_SNAPSHOTS; taken += 1) {
    await nextFrames(page);
    const next = await headerTargets(page, selector);
    equalInARow =
      JSON.stringify(next) === JSON.stringify(latest) ? equalInARow + 1 : 1;
    latest = next;
    if (equalInARow >= SETTLED_SNAPSHOTS) {
      return latest;
    }
  }
  throw new Error("The targets kept moving and never settled.");
}

/** The distance in CSS pixels between the boxes of two targets, 0 when they touch or overlap. */
export function gapBetween(a: HeaderTarget, b: HeaderTarget): number {
  const gapX = Math.max(
    0,
    a.left - (b.left + b.width),
    b.left - (a.left + a.width),
  );
  const gapY = Math.max(
    0,
    a.top - (b.top + b.height),
    b.top - (a.top + a.height),
  );
  return Math.hypot(gapX, gapY);
}
