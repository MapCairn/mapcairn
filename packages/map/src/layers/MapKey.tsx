// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { DEFAULT_MARKER_RADIUS, isCompactViewport } from "@mapcairn/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useChromeLayout } from "../chrome/layoutContext";
import { Icon } from "../ui/Icon";
import { Surface } from "../ui/Surface";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { LegendGlyph } from "./FeatureGlyph";
import { LayerKey } from "./LayerKey";
import * as styles from "./MapKey.css";
import { type MapKeyBlock, mapKeyBlocks } from "./mapKeyBlocks";
import type { DataLayers } from "./useDataLayers";
import { useScrolls } from "./useScrolls";

/** How many layers' glyphs the minimised chip shows; the count says the rest. */
const STRIP_LIMIT = 3;

/** Props for {@link MapKey}. */
export interface MapKeyProps {
  readonly layers: DataLayers;
  /**
   * Whether the key starts minimised. Left out, a phone in either orientation
   * starts it minimised (the viewport is narrower than the bottom sheet's
   * width or shorter than the side panel's height threshold) and a larger
   * screen starts it open. It is decided when the key first appears, so
   * turning the phone does not change it, and the person's own choice
   * replaces it from then on.
   */
  readonly defaultMinimised?: boolean;
}

/** The count in words, for the chip. */
function layerCount(count: number): string {
  return `${count} ${count === 1 ? "layer" : "layers"}`;
}

/** The first row of each block's key, as a strip of small glyphs. */
function GlyphStrip({ blocks }: { readonly blocks: readonly MapKeyBlock[] }) {
  return (
    <span className={styles.strip} aria-hidden="true">
      {blocks.slice(0, STRIP_LIMIT).map(({ id, entries }) => (
        <LegendGlyph
          key={id}
          entry={{
            ...entries[0],
            radius: Math.min(entries[0].radius, DEFAULT_MARKER_RADIUS),
          }}
        />
      ))}
    </span>
  );
}

/**
 * The key to the layers that are on, for the map itself: a panel named "Map
 * key" with one block for each layer that has a key, so a person can read
 * what the colours and shapes mean without opening the Layers section. It
 * draws the same rows the section does ({@link LayerKey}). It minimises to a
 * chip that shows a strip of glyphs and how many layers it covers, and renders
 * nothing while no layer that is on has a key.
 *
 * @remarks Put it in `MapChrome`'s `mapKey` slot, which keeps it clear of the
 *   other floating elements and caps its height. The minimised state is held
 *   in memory, so it lasts for the visit but not a reload. The button's name
 *   is "Map key, 3 layers" open and minimised, and `aria-expanded` says which.
 */
export function MapKey({ layers, defaultMinimised }: MapKeyProps) {
  const headingId = useId();
  const bodyId = useId();
  const { viewport } = useChromeLayout();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [decided, setDecided] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLElement>(null);
  const blocks = mapKeyBlocks(layers.layers);
  const hasBlocks = blocks.length > 0;
  const startsMinimised = defaultMinimised ?? isCompactViewport(viewport);
  // Before the chrome has measured, its viewport is empty and the default
  // would be a guess, so wait for it unless the host has decided.
  const canDecide = defaultMinimised !== undefined || viewport.width > 0;
  // The start state is decided once, when the key first appears, so turning a
  // phone to landscape (which is the side panel layout) does not change it.
  useEffect(() => {
    if (hasBlocks && canDecide) {
      setDecided((current) => current ?? startsMinimised);
    }
  }, [hasBlocks, canDecide, startsMinimised]);
  const minimised = chosen ?? decided ?? startsMinimised;
  // A box that scrolls needs a tab stop, or a keyboard cannot scroll it.
  const scrolls = useScrolls(bodyRef, !minimised && hasBlocks);
  if (!hasBlocks) {
    return null;
  }
  return (
    <Surface
      as="section"
      radius={minimised ? "pill" : "control"}
      aria-labelledby={headingId}
      className={styles.panel}
      data-minimised={minimised}
      data-testid="map-key"
    >
      <div className={styles.header}>
        {minimised ? (
          <VisuallyHidden as="h2" id={headingId}>
            Map key
          </VisuallyHidden>
        ) : (
          <h2 id={headingId} className={styles.heading}>
            Map key
          </h2>
        )}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!minimised}
          aria-controls={minimised ? undefined : bodyId}
          aria-label={`Map key, ${layerCount(blocks.length)}`}
          data-testid="map-key-toggle"
          onClick={() => setChosen(!minimised)}
        >
          {minimised ? (
            <>
              <GlyphStrip blocks={blocks} />
              <span className={styles.chipText}>
                Key, {layerCount(blocks.length)}
              </span>
            </>
          ) : null}
          <Icon icon={minimised ? ChevronUp : ChevronDown} />
        </button>
      </div>
      {minimised ? null : (
        <section
          ref={bodyRef}
          id={bodyId}
          className={styles.body}
          aria-label={scrolls ? "Layer keys" : undefined}
          tabIndex={scrolls ? 0 : undefined}
          data-testid="map-key-body"
        >
          <div className={styles.blocks}>
            {blocks.map((block) => (
              <div
                key={block.id}
                className={styles.block}
                data-testid={`map-key-${block.id}`}
              >
                <h3 className={styles.layerName}>{block.name}</h3>
                {block.chosenTime ? (
                  <p className={styles.when}>Showing {block.chosenTime}</p>
                ) : null}
                <LayerKey
                  definition={block.definition}
                  label={`${block.name} key`}
                  testId={`map-key-list-${block.id}`}
                  layout="stacked"
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </Surface>
  );
}
