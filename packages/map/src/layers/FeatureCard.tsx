// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  cardOf,
  type FormatterRegistry,
  formatTemplate,
  hasCard,
  isFeedLayer,
} from "@mapcairn/core";
import { ArrowLeft, Crosshair, Layers, TriangleAlert, X } from "lucide-react";
import { type Ref, useId } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { FeatureGlyph, featureClass } from "./FeatureGlyph";
import * as styles from "./Layers.css";
import type { DataLayers, DetailState, SelectedFeature } from "./useDataLayers";

/** The label of the affected-area button: `idle` until the area is shown or has failed to load. */
function detailButtonLabel(
  status: DetailState["status"] | undefined,
  idle: string,
): string {
  if (status === "shown") {
    return "Hide affected area";
  }
  return status === "error" ? "Try again" : idle;
}

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
 * The card for one feature, drawn from its definition's card template (a
 * feed's own, or the `identify` card of a tile layer): the title, for a feed
 * layer the words for its colour (with the same glyph as the map), its lines,
 * a link to the provider, the layer's disclaimer, "Show on map" and, for
 * layers with a detail source, "Show affected area" with what it costs. A
 * feature found by a tap has no style, so its card has no glyph or class
 * line. Renders nothing for a layer whose features have no card.
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
  const { definition } = selected.layer;
  if (!hasCard(definition)) {
    return null;
  }
  const { feature } = selected;
  const card = cardOf(definition);
  const feed = isFeedLayer(definition) ? definition : null;
  const detailSource = feed?.detail;
  const context = { now: layers.now() };
  const fill = (template: string) =>
    formatTemplate(template, feature.fields, formatters, context);
  const title = fill(card.title) ?? definition.name;
  const lines = card.lines
    .map(fill)
    .filter((line): line is string => line !== null && line.trim() !== "");
  const link = card.link ? safeLink(feature.fields[card.link.field]) : null;
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
      {feed ? (
        <p className={styles.cardLevel} data-testid="feature-card-class">
          <FeatureGlyph definition={feed} fields={feature.fields} radius={6} />
          {featureClass(feed, feature.fields)}
        </p>
      ) : null}
      {lines.map((line, index) => (
        // Lines come from the definition in a fixed order.
        // biome-ignore lint/suspicious/noArrayIndexKey: the template order never changes while the card is open.
        <p key={index} className={styles.cardLine}>
          {line}
        </p>
      ))}
      {link && card.link ? (
        <a
          className={styles.cardLink}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="feature-card-link"
        >
          {card.link.label}
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
        {detailSource ? (
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
            {detailButtonLabel(detail?.status, detailSource.label)}
          </Button>
        ) : null}
      </div>
      {detailSource && detail?.status !== "shown" ? (
        <p className={styles.muted}>
          {detail?.status === "error"
            ? "The affected area could not load."
            : `Uses ${detailSource.dataCost}.`}
        </p>
      ) : null}
    </article>
  );
}
