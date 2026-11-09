import {
  createFormatterRegistry,
  type FormatterRegistry,
  formatTemplate,
  type LayerFeature,
} from "@karta/core";
import { type Ref, useContext, useEffect, useRef } from "react";
import { MapContext } from "../host";
import {
  type HeadingLevel,
  nextHeadingLevel,
  Section,
  Subheading,
} from "../panels/Section";
import { useAnnounce } from "../ui/LiveRegion";
import { FeatureCard } from "./FeatureCard";
import { LayerItem } from "./LayerItem";
import * as styles from "./Layers.css";
import { featurePosition } from "./mapFeatures";
import type { DataLayerState, DataLayers } from "./useDataLayers";

/** The closest "Show on map" zooms out to: far enough to see the region. */
export const SHOW_ON_MAP_MIN_ZOOM = 5;

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
   * room for the map, for example by lowering the sheet.
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
 *   (`layers.focusRequest`); the focus moves after the sheet's own focus
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
  const { focusRequest } = layers;

  useEffect(() => {
    if (focusRequest === 0) {
      return;
    }
    // After the sheet's effects, which focus the section heading.
    queueMicrotask(() => {
      cardHeading.current?.focus({ preventScroll: true });
      cardHeading.current?.scrollIntoView?.({ block: "nearest" });
    });
  }, [focusRequest]);

  if (layers.layers.length === 0) {
    return null;
  }

  const show = (layerId: string, feature: LayerFeature) => {
    const position = featurePosition(feature);
    layers.select(layerId, feature.id);
    if (adapter && position) {
      adapter.setView({
        center: position,
        zoom: Math.max(adapter.getView().zoom, SHOW_ON_MAP_MIN_ZOOM),
      });
    }
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
    announce(`Showing ${title ?? "the feature"} on the map.`, {
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
      {layers.selected ? (
        <FeatureCard
          layers={layers}
          selected={layers.selected}
          formatters={formatters}
          headingLevel={groupLevel as 3 | 4 | 5 | 6}
          headingRef={cardHeading}
          onShowOnMap={() =>
            layers.selected &&
            show(layers.selected.layer.definition.id, layers.selected.feature)
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
