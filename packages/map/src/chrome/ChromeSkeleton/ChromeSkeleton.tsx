import { SearchPillSkeleton } from "../../tools/SearchPill/SearchPillSkeleton";
import { AttributionSkeleton } from "../Attribution/AttributionSkeleton";
import { EndStackSkeleton } from "../EndStack/EndStackSkeleton";
import * as styles from "../MapChrome/MapChrome.css";

/** Props for {@link ChromeSkeleton}. */
export interface ChromeSkeletonProps {
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
 *   `style-src 'self'`), uses no hooks and needs no provider, and is the same
 *   in light and dark themes because it uses only theme tokens.
 */
export function ChromeSkeleton({
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
        <SearchPillSkeleton />
      </div>
      <div className={styles.endStack} data-skeleton-slot="end-stack">
        <EndStackSkeleton directions={directions} draw={draw} />
      </div>
      <div className={styles.bottomEnd} data-skeleton-slot="bottom-end">
        <AttributionSkeleton />
      </div>
    </div>
  );
}
