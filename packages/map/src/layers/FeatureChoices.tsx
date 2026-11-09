import { type FormatterRegistry, formatTemplate } from "@karta/core";
import { X } from "lucide-react";
import { type Ref, useId } from "react";
import { IconButton } from "../ui/IconButton";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { FeatureGlyph } from "./FeatureGlyph";
import * as styles from "./Layers.css";
import type { DataLayers, SelectedFeature } from "./useDataLayers";

/** Props for {@link FeatureChoices}. */
export interface FeatureChoicesProps {
  readonly layers: DataLayers;
  /** The features found together, topmost first. */
  readonly choices: readonly SelectedFeature[];
  readonly formatters: FormatterRegistry;
  readonly headingLevel: 3 | 4 | 5 | 6;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/**
 * The list a tap (or the keyboard route) opens when it finds several
 * features together: each row names a feature and its layer, and opens that
 * feature's card, which offers a way back here. Rows are plain buttons in a
 * list, so the same list is reachable with the keyboard and a screen reader.
 */
export function FeatureChoices({
  layers,
  choices,
  formatters,
  headingLevel,
  headingRef,
}: FeatureChoicesProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const context = { now: layers.now() };
  return (
    <section
      className={styles.card}
      aria-labelledby={headingId}
      data-testid="feature-choices"
    >
      <div className={styles.cardHeader}>
        <Heading
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className={styles.cardHeading}
          data-testid="feature-choices-heading"
        >
          {choices.length.toLocaleString("en-GB")} features here
        </Heading>
        <IconButton
          label="Close list"
          icon={X}
          size="compact"
          data-testid="feature-choices-close"
          onClick={() => {
            const [first] = choices;
            if (first) {
              layers.select(first.layer.definition.id, null);
            }
          }}
        />
      </div>
      <p className={styles.muted}>Choose one to see its details.</p>
      <ul className={styles.rows}>
        {choices.map(({ layer, feature }) => {
          const { definition } = layer;
          const title =
            "card" in definition
              ? (formatTemplate(
                  definition.card.title,
                  feature.fields,
                  formatters,
                  context,
                ) ?? definition.name)
              : definition.name;
          return (
            <li
              key={`${definition.id}\u0000${feature.id}`}
              className={styles.rowItem}
            >
              <button
                type="button"
                className={styles.row}
                data-testid="feature-choices-row"
                onClick={() =>
                  layers.select(definition.id, feature.id, {
                    focus: true,
                    keepChoices: true,
                  })
                }
              >
                {"card" in definition ? (
                  <FeatureGlyph
                    definition={definition}
                    fields={feature.fields}
                    maxRadius={8}
                  />
                ) : null}
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{title}</span>
                  <span className={styles.rowSecondary}>{definition.name}</span>
                </span>
                <VisuallyHidden>, open details</VisuallyHidden>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
