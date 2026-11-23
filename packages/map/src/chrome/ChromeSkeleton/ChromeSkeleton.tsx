// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue } from "@mapcairn/core";
import {
  SearchPillSkeleton,
  type SearchPillSkeletonCopy,
} from "../../tools/SearchPill/SearchPillSkeleton";
import { AttributionSkeleton } from "../Attribution/AttributionSkeleton";
import {
  EndStackSkeleton,
  type EndStackSkeletonCopy,
} from "../EndStack/EndStackSkeleton";
import * as styles from "../MapChrome/MapChrome.css";

/** The words of every control {@link ChromeSkeleton} draws, in the host's default language. */
export interface ChromeSkeletonCopy {
  /** The words of the search pill's placeholder. */
  readonly search: SearchPillSkeletonCopy;
  /** The names of the end stack's controls. */
  readonly endStack: EndStackSkeletonCopy;
  /** The credits button's name. */
  readonly credits: string;
}

/**
 * The skeleton's words from `catalogue`, by the keys the live search pill,
 * end stack and credits button use, so the skeleton and the controls that
 * replace it say the same. A host calls it with its default-language
 * catalogue, on the server and in the browser alike, because the skeleton
 * uses no hook and no provider.
 */
export function chromeSkeletonCopy({
  t,
}: MessageCatalogue): ChromeSkeletonCopy {
  return {
    search: {
      placeholder: t("tools.search.places", {}),
      searchLabel: t("tools.search.label", {}),
    },
    endStack: {
      controls: t("chrome.endStack.controls", {}),
      mapOptions: t("chrome.endStack.mapOptions", {}),
      measure: t("chrome.endStack.measure", {}),
      directions: t("chrome.endStack.directions", {}),
      draw: t("chrome.endStack.draw", {}),
      locate: t("chrome.endStack.locate", {}),
      settings: t("chrome.endStack.settings", {}),
      zoomControls: t("chrome.endStack.zoomControls", {}),
      zoomIn: t("chrome.endStack.zoomIn", {}),
      zoomOut: t("chrome.endStack.zoomOut", {}),
    },
    credits: t("chrome.attribution.label", {}),
  };
}

/** Props for {@link ChromeSkeleton}. */
export interface ChromeSkeletonProps {
  /** The words of every control, from {@link chromeSkeletonCopy}. */
  readonly copy: ChromeSkeletonCopy;
  /**
   * Draws the Directions button, which the live chrome shows when the host
   * offers directions, so the controls are in their final places on first paint.
   */
  readonly directions?: boolean;
  /** Show the Draw shapes button, so the skeleton matches a host whose live chrome offers drawing. */
  readonly draw?: boolean;
}

/**
 * The server-rendered stand-in for `MapChrome`: the search pill, the map
 * controls, the zoom group on a device with a fine pointer and the credits
 * button, each in the slot and grid the live chrome uses, so the live chrome
 * replaces it in the same boxes. Render it over the map's background colour,
 * as the first paint before the map app mounts.
 *
 * @remarks It is decorative: `aria-hidden` and `inert`, so nobody can focus a
 *   control that does nothing yet. It reuses the {@link MapChrome} grid,
 *   padding and slot classes, and the real controls' own classes. The layout
 *   (bottom sheet or side panel) follows a media query built from the
 *   constants `chooseLayout` uses, because the server cannot measure the
 *   container. It writes no `style` attribute (production CSP is
 *   `style-src 'self'`), uses no hooks and needs no provider (its words arrive
 *   as `copy`), and is the same
 *   in light and dark themes because it uses only theme tokens.
 */
export function ChromeSkeleton({
  copy,
  directions = false,
  draw = false,
}: ChromeSkeletonProps) {
  return (
    <div
      className={styles.skeletonRoot}
      data-testid="chrome-skeleton"
      aria-hidden="true"
      inert
    >
      <div className={styles.topStart} data-skeleton-slot="top-start">
        <SearchPillSkeleton copy={copy.search} />
      </div>
      <div className={styles.endStack} data-skeleton-slot="end-stack">
        <EndStackSkeleton
          copy={copy.endStack}
          directions={directions}
          draw={draw}
        />
      </div>
      <div className={styles.bottomEnd} data-skeleton-slot="bottom-end">
        <AttributionSkeleton label={copy.credits} />
      </div>
    </div>
  );
}
