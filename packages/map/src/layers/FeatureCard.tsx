import {
  type FeedLayerDefinition,
  type FormatterRegistry,
  formatTemplate,
} from "@mapcairn/core";
import { ArrowLeft, Crosshair, Layers, TriangleAlert, X } from "lucide-react";
import { type Ref, useId } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { FeatureGlyph, featureClass } from "./FeatureGlyph";
import * as styles from "./Layers.css";
import type { DataLayers, SelectedFeature } from "./useDataLayers";

/** Props for {@link FeatureCard}. */
export interface FeatureCardProps {
  readonly layers: DataLayers;
  readonly selected: SelectedFeature;
  readonly formatters: FormatterRegistry;
  readonly headingLevel: 3 | 4 | 5 | 6;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** Centres the map on the feature. */
  readonly onShowOnMap: () => void;
}

/** A provider's link, only when it is plain `https`. */
function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === "https:" ? url.href : null;
}

/**
 * The card for one feature, drawn from its definition's card template: the
 * title, the words for its colour (with the same glyph as the map), its
 * lines, a link to the provider, the layer's disclaimer, "Show on map" and,
 * for layers with a detail source, "Show affected area" with what it costs.
 */
export function FeatureCard({
  layers,
  selected,
  formatters,
  headingLevel,
  headingRef,
  onShowOnMap,
}: FeatureCardProps) {
  const headingId = useId();
  const definition = selected.layer.definition as FeedLayerDefinition;
  const { feature } = selected;
  const context = { now: layers.now() };
  const fill = (template: string) =>
    formatTemplate(template, feature.fields, formatters, context);
  const title = fill(definition.card.title) ?? definition.name;
  const lines = definition.card.lines
    .map(fill)
    .filter((line): line is string => line !== null && line.trim() !== "");
  const link = definition.card.link
    ? safeLink(feature.fields[definition.card.link.field])
    : null;
  const detail =
    layers.detail?.layerId === definition.id &&
    layers.detail.featureId === feature.id
      ? layers.detail
      : null;
  const Heading = `h${headingLevel}` as const;

  return (
    <article
      className={styles.card}
      aria-labelledby={headingId}
      data-testid="feature-card"
    >
      <div className={styles.cardHeader}>
        <Heading
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className={styles.cardHeading}
          data-testid="feature-card-heading"
        >
          {title}
        </Heading>
        <IconButton
          label="Close card"
          icon={X}
          size="compact"
          data-testid="feature-card-close"
          onClick={() => {
            layers.hideDetail();
            layers.select(definition.id, null);
          }}
        />
      </div>
      <p className={styles.muted}>{definition.name}</p>
      <p className={styles.cardLevel}>
        <FeatureGlyph
          definition={definition}
          fields={feature.fields}
          radius={6}
        />
        {featureClass(definition, feature.fields)}
      </p>
      {lines.map((line, index) => (
        // Lines come from the definition in a fixed order.
        // biome-ignore lint/suspicious/noArrayIndexKey: the template order never changes while the card is open.
        <p key={index} className={styles.cardLine}>
          {line}
        </p>
      ))}
      {link && definition.card.link ? (
        <a
          className={styles.cardLink}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="feature-card-link"
        >
          {definition.card.link.label}
          <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
        </a>
      ) : null}
      {definition.disclaimer ? (
        <p className={styles.disclaimer} data-testid="feature-card-disclaimer">
          <Icon icon={TriangleAlert} />
          {definition.disclaimer}
        </p>
      ) : null}
      <div className={styles.cardActions}>
        {layers.choices ? (
          <Button
            variant="quiet"
            icon={ArrowLeft}
            data-testid="feature-card-back"
            onClick={() => layers.backToChoices({ focus: true })}
          >
            Back to list
          </Button>
        ) : null}
        <Button
          variant="secondary"
          icon={Crosshair}
          data-testid="feature-card-show"
          onClick={onShowOnMap}
        >
          Show on map
        </Button>
        {definition.detail ? (
          <Button
            variant="secondary"
            icon={Layers}
            busy={detail?.status === "loading"}
            data-testid="feature-card-detail"
            onClick={() =>
              detail?.status === "shown"
                ? layers.hideDetail()
                : layers.showDetail(definition.id, feature.id)
            }
          >
            {detail?.status === "shown"
              ? "Hide affected area"
              : detail?.status === "error"
                ? "Try again"
                : definition.detail.label}
          </Button>
        ) : null}
      </div>
      {definition.detail && detail?.status !== "shown" ? (
        <p className={styles.muted}>
          {detail?.status === "error"
            ? "The affected area could not load."
            : `Uses ${definition.detail.dataCost}.`}
        </p>
      ) : null}
    </article>
  );
}
