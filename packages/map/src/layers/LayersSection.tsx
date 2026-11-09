import {
  announceShowingFeature,
  boundsAroundPoint,
  createFormatterRegistry,
  type FormatterRegistry,
  formatTemplate,
  type LayerFeature,
} from "@karta/core";
import { type Ref, useContext, useEffect, useRef, useState } from "react";
import { useChromeLayout } from "../chrome/layoutContext";
import { MapContext } from "../host";
import {
  type HeadingLevel,
  nextHeadingLevel,
  Section,
  Subheading,
} from "../panels/Section";
import { usePreferences } from "../services";
import { useAnnounce } from "../ui/LiveRegion";
import { FeatureCard } from "./FeatureCard";
import { LayerItem } from "./LayerItem";
import * as styles from "./Layers.css";
import { featurePosition } from "./mapFeatures";
import { coveredPadding, revealOffset } from "./reveal";
import type { DataLayerState, DataLayers } from "./useDataLayers";

/** The closest "Show on map" zooms out to: far enough to see the region. */
export const SHOW_ON_MAP_MIN_ZOOM = 5;

/** Half the side, in metres, of the box "Show on map" fits around a point. Small enough that the fit always ends at the zoom cap. */
const SHOW_ON_MAP_RADIUS_METRES = 50;

const DEFAULT_FORMATTERS = createFormatterRegistry();

/** Props for {@link LayersSection}. */
export interface LayersSectionProps {
  readonly layers: DataLayers;
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** The formatters card and list templates may name. Defaults to the built-ins. */
  readonly formatters?: FormatterRegistry;
  /**
   * Called after "Show on map" has centred a feature, so the host can make
   * room for the map: the section keeps the feature clear of the sheet at
   * `REVEAL_DETENT`, so the host should bring the sheet to that detent.
   */
  readonly onShowOnMap?: () => void;
}

/** Layers grouped by their definitions' `group`, in the order groups first appear. */
function byGroup(layers: readonly DataLayerState[]) {
  const groups = new Map<string, DataLayerState[]>();
  for (const layer of layers) {
    const group = groups.get(layer.definition.group) ?? [];
    group.push(layer);
    groups.set(layer.definition.group, group);
  }
  return [...groups];
}

/**
 * The Layers section of the sheet and side panel, drawn entirely from the
 * layer definitions: a switch per layer with its data cost, and while a layer
 * is on, its status, controls, legend, disclaimer and the list of what
 * loaded. The open feature's card sits at the top. Renders nothing when the
 * host has no layers.
 *
 * @remarks A tap on the map asks for the card to take focus
 *   (`layers.focusPending`); the focus moves after the sheet's own focus
 *   effects, so the card heading wins over the section heading.
 */
export function LayersSection({
  layers,
  headingLevel = 3,
  headingRef,
  formatters = DEFAULT_FORMATTERS,
  onShowOnMap,
}: LayersSectionProps) {
  // Read optionally, so the section also renders outside a map (a test, a guide).
  const adapter = useContext(MapContext)?.adapter ?? null;
  const announce = useAnnounce();
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const { focusPending, consumeFocus } = layers;
  const { reducedMotion } = usePreferences();
  const motion = useRef(reducedMotion);
  motion.current = reducedMotion;
  const { layout, viewport, panelEdge } = useChromeLayout();
  const [cardRequest, setCardRequest] = useState(0);
  const { selected } = layers;

  // A tap on the map selected a point and opened its card: the card takes
  // focus, and the sheet or side panel that opened for it must not hide the
  // point (one that shows stays where it is). The side panel publishes its
  // edge after it opens, so wait for that. Acted on once: the section is
  // unmounted when the sheet closes, and reopening must not repeat this.
  useEffect(() => {
    if (
      !focusPending ||
      !selected ||
      (layout === "panel" && panelEdge === null)
    ) {
      return;
    }
    consumeFocus();
    // After the sheet's effects, which focus and smoothly scroll to the
    // section heading. The card sits just below it; an instant scroll here
    // would cut the sheet's smooth one short.
    queueMicrotask(() => {
      const heading = cardHeading.current;
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView?.({
        block: "start",
        behavior: motion.current ? "auto" : "smooth",
      });
    });
    const position = adapter ? featurePosition(selected.feature) : null;
    const offset =
      adapter && position
        ? revealOffset(adapter.project(position), {
            layout,
            viewport,
            panelEdge,
          })
        : null;
    if (adapter && offset) {
      adapter.panBy(offset.dx, offset.dy);
    }
  }, [
    adapter,
    selected,
    focusPending,
    consumeFocus,
    layout,
    viewport,
    panelEdge,
  ]);

  // "Show on map" lowers the sheet to a detent that shows the map as well as
  // the card, but the card sits above wherever the list was scrolled to.
  useEffect(() => {
    if (cardRequest === 0) {
      return;
    }
    cardHeading.current?.scrollIntoView?.({
      block: "start",
      behavior: motion.current ? "auto" : "smooth",
    });
  }, [cardRequest]);

  if (layers.layers.length === 0) {
    return null;
  }

  const show = (layerId: string, feature: LayerFeature) => {
    const position = featurePosition(feature);
    layers.select(layerId, feature.id);
    if (adapter && position) {
      const zoom = Math.max(adapter.getView().zoom, SHOW_ON_MAP_MIN_ZOOM);
      const padding = coveredPadding({ layout, viewport, panelEdge });
      if (padding) {
        // A fit with padding centres the point in what the sheet leaves free.
        adapter.fitBounds(
          boundsAroundPoint(position, SHOW_ON_MAP_RADIUS_METRES),
          { maxZoom: zoom, padding },
        );
      } else {
        adapter.setView({ center: position, zoom });
      }
    }
    setCardRequest((count) => count + 1);
    const layer = layers.layers.find((item) => item.definition.id === layerId);
    const title =
      layer && "card" in layer.definition
        ? formatTemplate(
            layer.definition.card.title,
            feature.fields,
            formatters,
            {
              now: layers.now(),
            },
          )
        : null;
    announce(announceShowingFeature(title ?? "the feature"), {
      priority: "polite",
    });
    onShowOnMap?.();
  };

  const groupLevel = nextHeadingLevel(headingLevel);
  return (
    <Section
      title="Layers"
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-layers"
    >
      {selected ? (
        <FeatureCard
          layers={layers}
          selected={selected}
          formatters={formatters}
          headingLevel={groupLevel as 3 | 4 | 5 | 6}
          headingRef={cardHeading}
          onShowOnMap={() =>
            show(selected.layer.definition.id, selected.feature)
          }
        />
      ) : null}
      <p className={styles.intro}>
        Open data from public providers. Nothing is requested until you turn a
        layer on.
      </p>
      <div className={styles.groups}>
        {byGroup(layers.layers).map(([group, items]) => (
          <div key={group} className={styles.group}>
            <Subheading level={groupLevel}>{group}</Subheading>
            <ul className={styles.layerList}>
              {items.map((layer) => (
                <LayerItem
                  key={layer.definition.id}
                  layer={layer}
                  layers={layers}
                  formatters={formatters}
                  onShow={show}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
