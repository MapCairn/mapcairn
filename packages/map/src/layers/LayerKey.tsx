// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type LayerDefinition, legendFor } from "@mapcairn/core";
import { LegendGlyph } from "./FeatureGlyph";
import * as styles from "./Layers.css";

/** Props for {@link LayerKey}. */
export interface LayerKeyProps {
  readonly definition: LayerDefinition;
  /** The list's accessible name, such as `Key for Earthquakes`. */
  readonly label: string;
  /** The list's `data-testid`. */
  readonly testId: string;
  /**
   * How the rows sit: `wrap` (the default) side by side, wrapping as the
   * line fills; `stacked` one to a line, with the glyphs in a fixed-width
   * column so the words line up.
   */
  readonly layout?: LayerKeyLayout;
}

/** How a {@link LayerKey} arranges its rows. */
export type LayerKeyLayout = "wrap" | "stacked";

/**
 * A layer's key: one row for each colour, shape or class its style draws,
 * with the same glyph the map uses and the words for it. The Layers section
 * and the map key both draw it, so the two cannot disagree. Renders nothing
 * for a layer whose definition has no key.
 *
 * @remarks The caller names the list, so two lists for one layer can sit on
 *   a page with different names.
 */
export function LayerKey({
  definition,
  label,
  testId,
  layout = "wrap",
}: LayerKeyProps) {
  const { entries } = legendFor(definition);
  if (entries.length === 0) {
    return null;
  }
  const stacked = layout === "stacked";
  return (
    <ul
      className={stacked ? styles.legendStacked : styles.legend}
      aria-label={label}
      data-testid={testId}
    >
      {entries.map((entry) => (
        <li
          key={entry.label}
          className={stacked ? styles.legendEntryStacked : styles.legendEntry}
        >
          <LegendGlyph entry={entry} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
