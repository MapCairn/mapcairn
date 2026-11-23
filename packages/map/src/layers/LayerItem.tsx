// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  describeChosenTime,
  describeTilesSlow,
  describeTilesUnavailable,
  describeZoomIn,
  describeZoomOut,
  type FormatterRegistry,
  formatLocale,
  formatMessage,
  formatTemplate,
  isControlEnabled,
  isFeedLayer,
  type LayerControlDefinition,
  type LayerFeature,
  loadsFeatures,
  type MessageCatalogue,
  resolveDateBound,
  resolveLayerTemplate,
} from "@mapcairn/core";
import { ArrowClockwise, Hourglass, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import {
  useFormatMessage,
  useMessages,
  useOnline,
  useResolveText,
  useSaveData,
} from "../services";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Isolate } from "../ui/Isolate";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Slider } from "../ui/Slider";
import { Switch } from "../ui/Switch";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { answersTap } from "./answersTap";
import { DateTimeControl } from "./DateTimeControl";
import { FeatureGlyph } from "./FeatureGlyph";
import { LayerKey } from "./LayerKey";
import * as styles from "./Layers.css";
import type { DataLayerState, DataLayers, LayerStatus } from "./useDataLayers";

/** How many rows the list shows before "Show all". */
const LIST_PAGE = 50;

/** The time of day a layer last updated, written for `locale`. */
function timeOfDay(updatedAt: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(updatedAt);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * The words for a failed load. A failure that happened offline says so only
 * while the device is still offline: once the connection is back, "you are
 * offline" would be untrue, so it reads as the plain network failure.
 */
function errorText(
  status: Extract<LayerStatus, { kind: "error" }>,
  online: boolean,
  t: MessageCatalogue["t"],
): string {
  if (status.error === "invalid") {
    return t("layers.status.loadFailedInvalid", {});
  }
  return status.offline === true && !online
    ? t("layers.status.loadFailedOffline", {})
    : t("layers.status.loadFailedNetwork", {});
}

/** The status line's words for a layer that is on. */
function statusText(
  status: LayerStatus,
  emptyText: string,
  messages: MessageCatalogue,
): string | null {
  const { t } = messages;
  const locale = formatLocale(messages);
  switch (status.kind) {
    case "loading":
      return t("layers.status.loading", {});
    case "ready":
      return messages.plural(
        status.capped ? "layers.status.updatedCapped" : "layers.status.updated",
        {
          time: timeOfDay(status.updatedAt, locale),
          count: status.count,
        },
      );
    case "zoom-in":
      return formatMessage(messages, describeZoomIn(status.level));
    case "zoom-out":
      return formatMessage(messages, describeZoomOut(status.level));
    case "empty":
      return t("layers.status.updatedEmpty", {
        time: timeOfDay(status.updatedAt, locale),
        text: emptyText,
      });
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
  const messages = useMessages();
  const resolve = useResolveText();
  const testId = `layer-control-${id}-${control.id}`;
  switch (control.kind) {
    case "segmented":
      return (
        <div data-testid={testId}>
          <SegmentedControl
            label={resolve(control.label)}
            options={control.options.map((option) => ({
              ...option,
              label: resolve(option.label),
            }))}
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
            label={resolve(control.label)}
            description={
              control.description === undefined
                ? undefined
                : resolve(control.description)
            }
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
          {resolve(control.label)}
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
    case "datetime":
      return (
        <DateTimeControl
          control={control}
          value={value}
          now={layers.now()}
          disabled={disabled}
          onChange={change}
          testId={testId}
        />
      );
    case "range":
      return (
        <div data-testid={testId}>
          <Slider
            label={resolve(control.label)}
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(value)}
            formatValue={(next) =>
              `${next}${control.unit === undefined ? "" : resolveLayerTemplate(control.unit, messages)}`
            }
            onValueChange={(next) =>
              change(String(Math.round(next * 1000) / 1000))
            }
            disabled={disabled}
          />
        </div>
      );
    case "opacity":
      return (
        <div data-testid={testId}>
          <Slider
            label={resolve(control.label)}
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
  const messages = useMessages();
  const { t } = messages;
  const resolve = useResolveText();
  const { definition } = layer;
  if (!isFeedLayer(definition) || layer.sorted.length === 0) {
    return null;
  }
  const context = { now: layers.now(), catalogue: messages };
  const rows = showAll ? layer.sorted : layer.sorted.slice(0, LIST_PAGE);
  const count = layer.sorted.length;
  return (
    <details
      className={styles.featureList}
      data-testid={`layer-list-${definition.id}`}
    >
      <summary className={styles.listSummary}>
        {messages.plural("layers.list.summary", { count })}
      </summary>
      {definition.list.sorts.length > 1 ? (
        <SegmentedControl
          label={t("layers.list.sortBy", {})}
          options={definition.list.sorts.map((sort) => ({
            value: sort.id,
            label: resolve(sort.label),
          }))}
          value={layer.sortId}
          onValueChange={(sortId) => layers.setSort(definition.id, sortId)}
        />
      ) : null}
      <ul className={styles.rows}>
        {rows.map((feature) => {
          const title =
            formatTemplate(
              definition.card.title,
              feature.fields,
              formatters,
              context,
            ) ?? resolve(definition.name);
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
                <FeatureGlyph
                  definition={definition}
                  fields={feature.fields}
                  maxRadius={8}
                />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    <Isolate>{title}</Isolate>
                  </span>
                  {secondary ? (
                    <span className={styles.rowSecondary}>
                      <Isolate>{secondary}</Isolate>
                    </span>
                  ) : null}
                </span>
                <VisuallyHidden>
                  , {t("layers.list.showOnMap", {})}
                </VisuallyHidden>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length < layer.sorted.length ? (
        <Button variant="quiet" onClick={() => setShowAll(true)}>
          {messages.plural("layers.list.showAll", { count })}
        </Button>
      ) : null}
    </details>
  );
}

/** Props for {@link LayerItem}. */
export interface LayerItemProps {
  /** The layer to show, with its state. */
  readonly layer: DataLayerState;
  /** The layers state, for the actions the item offers (turn on, sort, retry). */
  readonly layers: DataLayers;
  /** The formatters the layer's list and card templates may name. */
  readonly formatters: FormatterRegistry;
  /** Called with a feature when the person chooses Show on map for it. */
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
  const online = useOnline();
  const messages = useMessages();
  const resolve = useResolveText();
  const emptyText = loadsFeatures(definition)
    ? resolve(definition.emptyText)
    : "";
  const format = useFormatMessage();
  const { t } = messages;
  const text = statusText(status, emptyText, messages);
  return (
    <li className={styles.layerItem} data-testid={`layer-${definition.id}`}>
      <Switch
        label={resolve(definition.name)}
        description={resolve(definition.description)}
        checked={enabled}
        onCheckedChange={(checked) => layers.setEnabled(definition.id, checked)}
      />
      {saveData ? (
        <p className={styles.muted}>
          {t("layers.usesCost", { cost: resolve(definition.dataCost) })}
        </p>
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
          {status.kind === "tiles-slow" ? (
            <p
              className={styles.status}
              data-testid={`layer-status-${definition.id}`}
            >
              <span className={styles.statusWaiting}>
                <Icon icon={Hourglass} />
                {format(describeTilesSlow())}
              </span>
            </p>
          ) : null}
          {status.kind === "tiles-unavailable" ? (
            <p
              className={styles.status}
              data-testid={`layer-status-${definition.id}`}
            >
              <span className={styles.statusError}>
                <Icon icon={Warning} />
                {format(
                  describeTilesUnavailable(
                    describeChosenTime(definition, layer.controls),
                  ),
                )}
              </span>
            </p>
          ) : null}
          {status.kind === "error" ? (
            <div
              className={styles.status}
              data-testid={`layer-status-${definition.id}`}
            >
              <span className={styles.statusError}>
                <Icon icon={Warning} />
                {errorText(status, online, t)}
              </span>
              <Button
                variant="secondary"
                icon={ArrowClockwise}
                data-testid={`layer-retry-${definition.id}`}
                onClick={() => layers.retry(definition.id)}
              >
                {t("layers.tryAgain", {})}
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
          <LayerKey
            definition={definition}
            label={t("layers.keyFor", { name: resolve(definition.name) })}
            testId={`layer-legend-${definition.id}`}
          />
          {answersTap(layer) ? (
            <p
              className={styles.muted}
              data-testid={`layer-identify-hint-${definition.id}`}
            >
              {t("layers.identify.hint", {})}
            </p>
          ) : null}
          {definition.disclaimer ? (
            <p className={styles.disclaimer}>
              <Icon icon={Warning} />
              {resolve(definition.disclaimer)}
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
