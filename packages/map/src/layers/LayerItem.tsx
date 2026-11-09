import {
  evaluatePointStyle,
  type FormatterRegistry,
  formatTemplate,
  isControlEnabled,
  isFeedLayer,
  type LayerControlDefinition,
  type LayerFeature,
  legendFor,
  resolveDateBound,
} from "@karta/core";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useSaveData } from "../services";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Slider } from "../ui/Slider";
import { Switch } from "../ui/Switch";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import * as styles from "./Layers.css";
import { MarkerGlyph } from "./MarkerGlyph";
import type { DataLayerState, DataLayers, LayerStatus } from "./useDataLayers";

/** How many rows the list shows before "Show all". */
export const LIST_PAGE = 50;

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** The status line's words for a layer that is on. */
function statusText(status: LayerStatus, emptyText: string): string | null {
  switch (status.kind) {
    case "loading":
      return "Loading";
    case "ready":
      return `Updated ${TIME.format(status.updatedAt)}, ${status.count.toLocaleString("en-GB")} shown`;
    case "empty":
      return `Updated ${TIME.format(status.updatedAt)}. ${emptyText}`;
    default:
      return null;
  }
}

interface ControlProps {
  readonly layer: DataLayerState;
  readonly control: LayerControlDefinition;
  readonly layers: DataLayers;
}

/** One control of a layer, drawn from its definition. */
function LayerControl({ layer, control, layers }: ControlProps) {
  const id = layer.definition.id;
  const value = layer.controls[control.id] ?? "";
  const disabled = !isControlEnabled(control, layer.controls);
  const change = (next: string) => layers.setControl(id, control.id, next);
  const testId = `layer-control-${id}-${control.id}`;
  switch (control.kind) {
    case "segmented":
      return (
        <div data-testid={testId}>
          <SegmentedControl
            label={control.label}
            options={control.options}
            value={value}
            onValueChange={change}
            disabled={disabled}
          />
        </div>
      );
    case "switch":
      return (
        <div data-testid={testId}>
          <Switch
            label={control.label}
            description={control.description}
            checked={value === "true"}
            onCheckedChange={(checked) => change(String(checked))}
            disabled={disabled}
          />
        </div>
      );
    case "date": {
      const now = layers.now();
      return (
        <label className={styles.field}>
          {control.label}
          <input
            type="date"
            className={styles.dateInput}
            min={resolveDateBound(control.min, now)}
            max={resolveDateBound(control.max, now)}
            value={value}
            disabled={disabled}
            data-testid={testId}
            onChange={(event) => {
              if (event.target.value !== "") {
                change(event.target.value);
              }
            }}
          />
        </label>
      );
    }
    case "opacity":
      return (
        <div data-testid={testId}>
          <Slider
            label={control.label}
            min={0.1}
            max={1}
            step={0.05}
            value={Number(value)}
            formatValue={percent}
            onValueChange={(next) =>
              change(String(Math.round(next * 100) / 100))
            }
            disabled={disabled}
          />
        </div>
      );
  }
}

/** The legend, derived from the layer's style. */
function LayerLegend({ layer }: { layer: DataLayerState }) {
  const { entries } = legendFor(layer.definition);
  if (entries.length === 0) {
    return null;
  }
  return (
    <ul
      className={styles.legend}
      aria-label={`Key for ${layer.definition.name}`}
      data-testid={`layer-legend-${layer.definition.id}`}
    >
      {entries.map((entry) => (
        <li key={entry.label} className={styles.legendEntry}>
          <MarkerGlyph
            shape={entry.shape}
            colour={entry.colour}
            radius={entry.radius}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

interface ListProps {
  readonly layer: DataLayerState;
  readonly layers: DataLayers;
  readonly formatters: FormatterRegistry;
  readonly onShow: (feature: LayerFeature) => void;
}

/**
 * The loaded features as a list, the keyboard and screen-reader route to the
 * same cards a tap on the map opens. Each row shows its feature on the map.
 */
function FeatureList({ layer, layers, formatters, onShow }: ListProps) {
  const [showAll, setShowAll] = useState(false);
  const { definition } = layer;
  if (!isFeedLayer(definition) || layer.sorted.length === 0) {
    return null;
  }
  const context = { now: layers.now() };
  const rows = showAll ? layer.sorted : layer.sorted.slice(0, LIST_PAGE);
  const count = layer.sorted.length.toLocaleString("en-GB");
  return (
    <details
      className={styles.featureList}
      data-testid={`layer-list-${definition.id}`}
    >
      <summary className={styles.listSummary}>
        List of {count} on the map
      </summary>
      {definition.list.sorts.length > 1 ? (
        <SegmentedControl
          label="Sort by"
          options={definition.list.sorts.map((sort) => ({
            value: sort.id,
            label: sort.label,
          }))}
          value={layer.sortId}
          onValueChange={(sortId) => layers.setSort(definition.id, sortId)}
        />
      ) : null}
      <ul className={styles.rows}>
        {rows.map((feature) => {
          const marker = evaluatePointStyle(definition.style, feature.fields);
          const title =
            formatTemplate(
              definition.card.title,
              feature.fields,
              formatters,
              context,
            ) ?? definition.name;
          const secondary = formatTemplate(
            definition.list.secondary,
            feature.fields,
            formatters,
            context,
          );
          return (
            <li key={feature.id} className={styles.rowItem}>
              <button
                type="button"
                className={styles.row}
                data-testid="layer-list-row"
                onClick={() => onShow(feature)}
              >
                <MarkerGlyph
                  shape={marker.shape}
                  colour={marker.colour}
                  radius={Math.min(marker.radius, 8)}
                />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{title}</span>
                  {secondary ? (
                    <span className={styles.rowSecondary}>{secondary}</span>
                  ) : null}
                </span>
                <VisuallyHidden>, show on map</VisuallyHidden>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length < layer.sorted.length ? (
        <Button variant="quiet" onClick={() => setShowAll(true)}>
          Show all {count}
        </Button>
      ) : null}
    </details>
  );
}

/** Props for {@link LayerItem}. */
export interface LayerItemProps {
  readonly layer: DataLayerState;
  readonly layers: DataLayers;
  readonly formatters: FormatterRegistry;
  readonly onShow: (layerId: string, feature: LayerFeature) => void;
}

/**
 * One layer in the Layers section: its switch with what it costs, and while
 * it is on, its status, controls, legend, disclaimer and list. Everything
 * comes from the definition.
 */
export function LayerItem({
  layer,
  layers,
  formatters,
  onShow,
}: LayerItemProps) {
  const { definition, enabled, status } = layer;
  // Only worth a line for someone who is saving data.
  const saveData = useSaveData();
  const emptyText = isFeedLayer(definition) ? definition.emptyText : "";
  const text = statusText(status, emptyText);
  return (
    <li className={styles.layerItem} data-testid={`layer-${definition.id}`}>
      <Switch
        label={definition.name}
        description={definition.description}
        checked={enabled}
        onCheckedChange={(checked) => layers.setEnabled(definition.id, checked)}
      />
      {saveData ? (
        <p className={styles.muted}>Uses {definition.dataCost}.</p>
      ) : null}
      {enabled ? (
        <div className={styles.details}>
          {text ? (
            <p
              className={styles.status}
              data-testid={`layer-status-${definition.id}`}
            >
              {text}
            </p>
          ) : null}
          {status.kind === "error" ? (
            <div
              className={styles.status}
              data-testid={`layer-status-${definition.id}`}
            >
              <span className={styles.statusError}>
                <Icon icon={TriangleAlert} />
                {status.error === "network"
                  ? "Could not load. Check your connection."
                  : "Could not load: the provider sent something unexpected."}
              </span>
              <Button
                variant="secondary"
                icon={RotateCw}
                data-testid={`layer-retry-${definition.id}`}
                onClick={() => layers.retry(definition.id)}
              >
                Try again
              </Button>
            </div>
          ) : null}
          {definition.controls.map((control) => (
            <LayerControl
              key={control.id}
              layer={layer}
              control={control}
              layers={layers}
            />
          ))}
          <LayerLegend layer={layer} />
          {definition.disclaimer ? (
            <p className={styles.disclaimer}>
              <Icon icon={TriangleAlert} />
              {definition.disclaimer}
            </p>
          ) : null}
          <FeatureList
            layer={layer}
            layers={layers}
            formatters={formatters}
            onShow={(feature) => onShow(definition.id, feature)}
          />
        </div>
      ) : null}
    </li>
  );
}
