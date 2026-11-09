import type { Layer } from "@karta/core";
import {
  DEFAULT_NO_DATA_COLOR,
  DEFAULT_NO_DATA_COLOR_DARK,
  resolveThemedColor,
} from "@karta/core";
import { useResolvedDarkTheme } from "@karta/react";
import { memo, useMemo } from "react";
import { useDomain } from "../../context/DomainContext";
import * as styles from "./Legend.css";

/**
 * `Legend`'s own overridable copy, all defaulting to English. Factored out
 * from `LegendProps` so `DesktopLegend`/`MobileLegend` (which each render
 * a `Legend` internally) can accept and forward the same set without
 * repeating every field.
 */
export interface LegendLabels {
  /** Fallback bucket label for a choropleth value outside every configured bucket. Defaults to `"No data"`. */
  noDataLabel?: string;
  /** Heading above the line-layer entries. Defaults to `"Line layers"`. */
  lineLayersLabel?: string;
  /** `aria-label` on the line entries' own list. Defaults to `"Line layer colours"`. */
  lineColorsAriaLabel?: string;
  /** Shown in place of any legend sections when `mode="active"` and no layer is visible. Defaults to `"Turn on layers to view their legend."`. */
  emptyMessage?: string;
  /** Appended to a line entry that also has point markers. Defaults to `" · line + points"`. */
  lineAndPointsNote?: string;
  /** Appended to a line entry that has a route line only. Defaults to `" · line only"`. */
  lineOnlyNote?: string;
  /** Builds a legend section's `aria-label` when `mode="active"`, from that section's own heading text (a choropleth layer's label, or the line-layers heading). Defaults to `` (label) => `Active map layers legend: ${label}` ``. */
  formatActiveAriaLabel?: (label: string) => string;
}

interface LegendProps extends LegendLabels {
  mode?: "all" | "active";
  visibleLayerIds?: string[];
  compact?: boolean;
}

const DEFAULT_NO_DATA_LABEL = "No data";
const DEFAULT_LINE_LAYERS_LABEL = "Line layers";
const DEFAULT_LINE_COLORS_ARIA_LABEL = "Line layer colours";
const DEFAULT_EMPTY_MESSAGE = "Turn on layers to view their legend.";
const DEFAULT_LINE_AND_POINTS_NOTE = " · line + points";
const DEFAULT_LINE_ONLY_NOTE = " · line only";
const DEFAULT_FORMAT_ACTIVE_ARIA_LABEL = (label: string) =>
  `Active map layers legend: ${label}`;

/**
 * Resolves choropleth legend sections, one per visible choropleth layer.
 * @param dark - When `true`, each bucket's `darkColor` is shown instead of
 *   `color` (falling back to `color` when unset), so the legend swatch
 *   always matches what `MapView` actually renders for the same theme.
 */
function choroplethLegends(
  layers: readonly Layer[],
  visibleLayerIds: string[] | undefined,
  dark: boolean,
  noDataLabel: string,
) {
  return layers.flatMap((layer) => {
    if (layer.style.kind !== "choropleth") {
      return [];
    }
    if (visibleLayerIds && !visibleLayerIds.includes(layer.id)) {
      return [];
    }
    return [
      {
        layer,
        entries: [
          ...layer.style.buckets.map((bucket) => ({
            label: bucket.label,
            color: resolveThemedColor(bucket.color, bucket.darkColor, dark),
          })),
          {
            label: noDataLabel,
            color: resolveThemedColor(
              DEFAULT_NO_DATA_COLOR,
              DEFAULT_NO_DATA_COLOR_DARK,
              dark,
            ),
          },
        ],
      },
    ];
  });
}

function getLineEntries(
  layers: readonly Layer[],
  visibleLayerIds: string[] | undefined,
  dark: boolean,
) {
  return layers.flatMap((layer) => {
    if (
      !layer.available ||
      layer.style.kind !== "line" ||
      (visibleLayerIds && !visibleLayerIds.includes(layer.id))
    ) {
      return [];
    }

    const { style } = layer;
    const hasPoints = layer.hasPointGeometry === true;
    const pattern = {
      dashArray: style.dashArray,
      casingColor: style.casing
        ? resolveThemedColor(style.casing.color, style.casing.darkColor, dark)
        : undefined,
    };

    if (style.colorClassification) {
      return style.colorClassification.stops.map((stop) => ({
        label: stop.label,
        color: stop.value,
        hasPoints,
        ...pattern,
      }));
    }

    return [
      {
        label: style.legendLabel,
        color: resolveThemedColor(style.color, style.darkColor, dark),
        hasPoints,
        ...pattern,
      },
    ];
  });
}

/**
 * A short sample of an overlay line, drawn as SVG so the legend shows the
 * same dash pattern and casing as the map.
 */
function LineSwatch({
  color,
  dashArray,
  casingColor,
}: {
  color: string;
  dashArray?: string;
  casingColor?: string;
}) {
  return (
    <svg
      className={styles.lineSwatch}
      viewBox="0 0 24 8"
      aria-hidden="true"
      focusable="false"
    >
      {casingColor ? (
        <line
          x1="1"
          y1="4"
          x2="23"
          y2="4"
          stroke={casingColor}
          strokeWidth="6"
        />
      ) : null}
      <line
        x1="1"
        y1="4"
        x2="23"
        y2="4"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={dashArray}
      />
    </svg>
  );
}

function getLegendAriaLabel(
  mode: "all" | "active",
  label: string,
  formatActiveAriaLabel: (label: string) => string,
) {
  if (mode === "active") {
    return formatActiveAriaLabel(label);
  }
  return label;
}

function LegendComponent({
  mode = "all",
  visibleLayerIds = [],
  compact = false,
  noDataLabel = DEFAULT_NO_DATA_LABEL,
  lineLayersLabel = DEFAULT_LINE_LAYERS_LABEL,
  lineColorsAriaLabel = DEFAULT_LINE_COLORS_ARIA_LABEL,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  lineAndPointsNote = DEFAULT_LINE_AND_POINTS_NOTE,
  lineOnlyNote = DEFAULT_LINE_ONLY_NOTE,
  formatActiveAriaLabel = DEFAULT_FORMAT_ACTIVE_ARIA_LABEL,
}: LegendProps) {
  const { getLayers } = useDomain();
  const layers = getLayers();
  const isActiveMode = mode === "active";
  const resolvedDark = useResolvedDarkTheme();
  const activeLayerIds = isActiveMode ? visibleLayerIds : undefined;
  /**
   * @remarks Both derived lists walk every layer (and, for choropleths,
   *   every bucket) and allocate a fresh entry object per swatch. Memoised
   *   for the same reason `MapView` memoises its own derived layer maps: the
   *   legend re-renders on unrelated parent state (panel drag frames, menu
   *   toggles), and rebuilding these each time also gave every rendered
   *   entry a new identity for no benefit.
   */
  const choroplethSections = useMemo(
    () => choroplethLegends(layers, activeLayerIds, resolvedDark, noDataLabel),
    [layers, activeLayerIds, resolvedDark, noDataLabel],
  );
  const lineEntries = useMemo(
    () => getLineEntries(layers, activeLayerIds, resolvedDark),
    [layers, activeLayerIds, resolvedDark],
  );
  const hasAnyLegendSection =
    choroplethSections.length > 0 || lineEntries.length > 0;

  return (
    <div className={styles.groups} data-compact={compact ? "true" : undefined}>
      {choroplethSections.map(({ layer, entries }) => (
        <div key={layer.id}>
          <h3 className={styles.groupTitle}>{layer.label}</h3>
          <ul
            className={styles.legend}
            aria-label={getLegendAriaLabel(
              mode,
              layer.label,
              formatActiveAriaLabel,
            )}
          >
            {entries.map((entry) => (
              <li key={entry.label} className={styles.entry}>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <span className={styles.label}>{entry.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {lineEntries.length > 0 ? (
        <div className={styles.fullWidthGroup}>
          <h3 className={styles.groupTitle}>{lineLayersLabel}</h3>
          <ul
            className={styles.legend}
            aria-label={getLegendAriaLabel(
              mode,
              lineColorsAriaLabel,
              formatActiveAriaLabel,
            )}
          >
            {lineEntries.map((entry) => (
              <li key={entry.label} className={styles.entry}>
                <span className={styles.symbolGroup} aria-hidden="true">
                  <LineSwatch
                    color={entry.color}
                    dashArray={entry.dashArray}
                    casingColor={entry.casingColor}
                  />
                  {entry.hasPoints ? (
                    <span
                      className={styles.dotSwatch}
                      style={{ backgroundColor: entry.color }}
                    />
                  ) : null}
                </span>
                <span className={styles.label}>
                  {entry.label}
                  <span className={styles.symbolNote}>
                    {entry.hasPoints ? lineAndPointsNote : lineOnlyNote}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!hasAnyLegendSection ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : null}
    </div>
  );
}

/**
 * Renders choropleth and overlay layer legend entries for a map domain.
 * @remarks Must be rendered inside a `DomainProvider`. Choropleth swatches
 *   resolve each bucket's `darkColor` over `color` while dark theme is
 *   active, matching the fill `MapView` renders for the same theme. Memoized
 *   like `MapView` itself, since it renders inside the same panel/bottom-sheet
 *   tree that re-renders on unrelated parent state (drag frames, menu toggles).
 * @example
 * <DomainProvider domain={domain}>
 *   <Legend mode="active" visibleLayerIds={["areas"]} />
 * </DomainProvider>
 */
export const Legend = memo(LegendComponent);
