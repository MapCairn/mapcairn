import {
  featureCollectionToCsv,
  fetchFeatureCollection,
  type Layer,
} from "@karta/core";
import { ChevronDown, Download, FileSpreadsheet } from "lucide-react";
import { Fragment, memo, useMemo, useState } from "react";
import { getLayer, getLayerGroups } from "../../layers/registry";
import { m } from "../../paraglide/messages.js";
import * as styles from "./LayerToggles.css";

/** Download filename for one of a layer's `dataSource` URLs; suffixed with a 1-based index when the layer has more than one source, so filenames don't collide. */
function downloadFileName(
  layer: Layer,
  sourceIndex: number,
  extension: string,
): string {
  const suffix = layer.dataSource.length > 1 ? `-${sourceIndex + 1}` : "";
  return `${layer.id}${suffix}.${extension}`;
}

/** Key identifying one layer/dataSource pair's CSV export status in `csvExportStatus`. */
function csvExportKey(layer: Layer, sourceIndex: number): string {
  return `${layer.id}-${sourceIndex}`;
}

/** Prompts the browser to save `blob` as `fileName`, without navigating away from the page. */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface LayerTogglesProps {
  visibleLayerIds: string[];
  onToggle: (id: string) => void;
  opacityByLayer?: Record<string, number>;
  onOpacityChange?: (id: string, opacity: number) => void;
  /** Ids of layers whose data failed to load, shown with a retry hint badge. */
  failedLayerIds?: string[];
}

type CsvExportStatus = Record<string, "loading" | "error">;

function layerPropertyKey(layer: Layer): string | undefined {
  if (layer.style.kind === "choropleth") {
    return layer.style.propertyKey;
  }
  return layer.style.colorClassification?.propertyKey;
}

function LayerMetadata({ layer }: { layer: Layer }) {
  const propertyKey = layerPropertyKey(layer);
  return (
    <dl>
      <div>
        <dt>{m.layer_metadata_geometry()}</dt>
        <dd>{layer.geometryKind}</dd>
      </div>
      {propertyKey ? (
        <div>
          <dt>{m.layer_metadata_property()}</dt>
          <dd>{propertyKey}</dd>
        </div>
      ) : null}
      {layer.style.kind === "choropleth" ? (
        <div>
          <dt>{m.layer_metadata_legend()}</dt>
          <dd>
            {layer.style.buckets.map((bucket) => bucket.label).join(", ")}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function LayerDownloadMenu({
  layer,
  open,
  status,
  onCsvExport,
}: {
  layer: Layer;
  open: boolean;
  status: CsvExportStatus;
  onCsvExport: (layer: Layer, sourceIndex: number, url: string) => void;
}) {
  return (
    <>
      {layer.dataSource.map((_url, sourceIndex) => {
        const key = csvExportKey(layer, sourceIndex);
        const sourceSuffix =
          layer.dataSource.length > 1 ? `-${sourceIndex + 1}` : "";
        return status[key] === "error" ? (
          <span
            key={key}
            className={styles.badgeError}
            role="status"
            data-testid={`layer-toggle-${layer.id}-csv-error${sourceSuffix}`}
            data-e2e={`layer-toggle-${layer.id}-csv-error${sourceSuffix}`}
          >
            {m.layer_csv_export_error()}
          </span>
        ) : null;
      })}
      {open ? (
        <fieldset
          id={`layer-toggle-${layer.id}-download-menu`}
          className={styles.downloadMenu}
          aria-label={m.layer_download_menu_label({ label: layer.label })}
        >
          <legend>{m.layer_download_menu_label({ label: layer.label })}</legend>
          {layer.dataSource.map((url, sourceIndex) => {
            const key = csvExportKey(layer, sourceIndex);
            const suffix =
              layer.dataSource.length > 1 ? ` ${sourceIndex + 1}` : "";
            const sourceSuffix = suffix ? `-${sourceIndex + 1}` : "";
            return (
              <Fragment key={url}>
                <a
                  href={url}
                  download={downloadFileName(layer, sourceIndex, "geojson")}
                  aria-label={`${m.layer_download_geojson()}${suffix}, ${m.layer_download_aria_label({ label: layer.label })}`}
                  data-testid={`layer-toggle-${layer.id}-download${sourceSuffix}`}
                  data-e2e={`layer-toggle-${layer.id}-download${sourceSuffix}`}
                >
                  {m.layer_download_geojson()}
                  {suffix}
                </a>
                <button
                  type="button"
                  aria-label={`${m.layer_download_csv()}${suffix}, ${m.layer_download_csv_aria_label({ label: layer.label })}`}
                  data-testid={`layer-toggle-${layer.id}-download-csv${sourceSuffix}`}
                  data-e2e={`layer-toggle-${layer.id}-download-csv${sourceSuffix}`}
                  disabled={status[key] === "loading"}
                  onClick={() => onCsvExport(layer, sourceIndex, url)}
                >
                  <FileSpreadsheet aria-hidden="true" />
                  {m.layer_download_csv()}
                  {suffix}
                </button>
              </Fragment>
            );
          })}
        </fieldset>
      ) : null}
    </>
  );
}

function LayerRow({
  layer,
  visible,
  opacity,
  failed,
  downloadOpen,
  metadataOpen,
  csvExportStatus,
  onToggle,
  onOpacityChange,
  onDownloadToggle,
  onMetadataToggle,
  onCsvExport,
}: {
  layer: Layer;
  visible: boolean;
  opacity: number;
  failed: boolean;
  downloadOpen: boolean;
  metadataOpen: boolean;
  csvExportStatus: CsvExportStatus;
  onToggle: (id: string) => void;
  onOpacityChange?: (id: string, opacity: number) => void;
  onDownloadToggle: (id: string) => void;
  onMetadataToggle: (id: string, open: boolean) => void;
  onCsvExport: (layer: Layer, sourceIndex: number, url: string) => void;
}) {
  const testId = `layer-toggle-${layer.id}`;
  const labelId = `${testId}-label`;
  const descriptionId = `${testId}-description`;
  return (
    <li>
      <div
        className={styles.row}
        data-unavailable={layer.available ? undefined : "true"}
        data-testid={`${testId}-row`}
        data-e2e={`${testId}-row`}
      >
        <div className={styles.rowMain}>
          <label className={styles.rowLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              data-testid={testId}
              data-e2e={testId}
              checked={visible}
              disabled={!layer.available}
              onChange={() => onToggle(layer.id)}
              aria-labelledby={labelId}
              aria-describedby={layer.description ? descriptionId : undefined}
            />
            <span className={styles.label} id={labelId}>
              {layer.label}
            </span>
            {!layer.available ? (
              <span className={styles.badge}>
                {m.layer_unavailable_badge()}
              </span>
            ) : null}
            {layer.available && failed ? (
              <span
                className={styles.badgeError}
                role="status"
                data-testid={`${testId}-error`}
                data-e2e={`${testId}-error`}
              >
                {m.layer_failed_badge()}
              </span>
            ) : null}
          </label>
          {layer.available ? (
            <button
              type="button"
              className={styles.downloadToggle}
              aria-expanded={downloadOpen}
              aria-controls={`${testId}-download-menu`}
              data-testid={`${testId}-download-menu-trigger`}
              data-e2e={`${testId}-download-menu-trigger`}
              onClick={() => onDownloadToggle(layer.id)}
            >
              {m.layer_download_button()}
              <Download aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {layer.description ? (
          <p
            className={styles.description}
            id={descriptionId}
            data-testid={descriptionId}
            data-e2e={descriptionId}
          >
            {layer.description}
          </p>
        ) : null}
        {layer.available ? (
          <label className={styles.opacityControl}>
            <span>{m.layer_opacity_label({ label: layer.label })}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              aria-label={m.layer_opacity_label({ label: layer.label })}
              data-testid={`${testId}-opacity`}
              data-e2e={`${testId}-opacity`}
              onChange={(event) =>
                onOpacityChange?.(layer.id, Number(event.currentTarget.value))
              }
            />
          </label>
        ) : null}
        <details
          className={styles.metadata}
          open={metadataOpen}
          onToggle={(event) =>
            onMetadataToggle(layer.id, event.currentTarget.open)
          }
        >
          <summary>{m.layer_metadata_label()}</summary>
          <LayerMetadata layer={layer} />
        </details>
        {layer.available ? (
          <LayerDownloadMenu
            layer={layer}
            open={downloadOpen}
            status={csvExportStatus}
            onCsvExport={onCsvExport}
          />
        ) : null}
      </div>
    </li>
  );
}

function LayerTogglesComponent({
  visibleLayerIds,
  onToggle,
  opacityByLayer = {},
  onOpacityChange,
  failedLayerIds = [],
}: LayerTogglesProps) {
  /**
   * @remarks Memoized with no dependencies: `getLayerGroups()`/`getLayer()`
   *   re-run `packages/web`'s translation overlay on every call, and the
   *   active locale can't change without a full document reload (see
   *   `LanguageToggle`'s own remarks), so re-deriving these on every
   *   unrelated re-render of this (frequently remounted-in-place, e.g. by
   *   mobile drag-frame updates in a parent) component would just redo the
   *   same translation work for the same result.
   */
  const groups = useMemo(() => getLayerGroups(), []);
  const layersById = useMemo(() => {
    const map = new Map<string, Layer>();
    for (const group of groups) {
      for (const layerId of group.layerIds) {
        if (!map.has(layerId)) {
          const layer = getLayer(layerId);
          if (layer) {
            map.set(layerId, layer);
          }
        }
      }
    }
    return map;
  }, [groups]);
  const [csvExportStatus, setCsvExportStatus] = useState<
    Record<string, "loading" | "error">
  >({});
  const [filter, setFilter] = useState("");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>([]);
  const [metadataLayerIds, setMetadataLayerIds] = useState<string[]>([]);
  const [downloadMenuLayerId, setDownloadMenuLayerId] = useState<string | null>(
    null,
  );

  async function handleCsvExport(
    layer: Layer,
    sourceIndex: number,
    url: string,
  ) {
    const key = csvExportKey(layer, sourceIndex);
    setCsvExportStatus((status) => ({ ...status, [key]: "loading" }));
    try {
      const collection = await fetchFeatureCollection(url);
      downloadBlob(
        new Blob([featureCollectionToCsv(collection)], {
          type: "text/csv;charset=utf-8",
        }),
        downloadFileName(layer, sourceIndex, "csv"),
      );
      setCsvExportStatus((status) => {
        const next = { ...status };
        delete next[key];
        return next;
      });
    } catch {
      setCsvExportStatus((status) => ({ ...status, [key]: "error" }));
    }
  }

  function renderLayer(layer: Layer) {
    return (
      <LayerRow
        key={layer.id}
        layer={layer}
        visible={visibleLayerIds.includes(layer.id)}
        opacity={opacityByLayer[layer.id] ?? 1}
        failed={failedLayerIds.includes(layer.id)}
        downloadOpen={downloadMenuLayerId === layer.id}
        metadataOpen={metadataLayerIds.includes(layer.id)}
        csvExportStatus={csvExportStatus}
        onToggle={onToggle}
        onOpacityChange={onOpacityChange}
        onDownloadToggle={(id) =>
          setDownloadMenuLayerId(downloadMenuLayerId === id ? null : id)
        }
        onMetadataToggle={(id, open) =>
          setMetadataLayerIds((current) =>
            open
              ? [...new Set([...current, id])]
              : current.filter((existingId) => existingId !== id),
          )
        }
        onCsvExport={handleCsvExport}
      />
    );
  }

  const filteredGroups = groups
    .map((group) => ({
      group,
      layers: group.layerIds
        .map((layerId) => layersById.get(layerId))
        .filter((layer): layer is Layer => Boolean(layer))
        .filter((layer) => {
          const query = filter.trim().toLocaleLowerCase();
          return (
            query.length === 0 ||
            `${layer.label} ${layer.description ?? ""}`
              .toLocaleLowerCase()
              .includes(query)
          );
        }),
    }))
    .filter(({ layers }) => layers.length > 0);

  return (
    <div className={styles.groups}>
      <label className={styles.searchLabel}>
        {m.layer_search_label()}
        <input
          type="search"
          value={filter}
          placeholder={m.layer_search_placeholder()}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
      </label>
      {filteredGroups.length === 0 ? (
        <p role="status" className={styles.groupHint}>
          {m.layer_search_empty()}
        </p>
      ) : null}
      {filteredGroups.map(({ group, layers }, index) => {
        const collapsed = collapsedGroupIds.includes(group.id);
        return (
          <Fragment key={group.id}>
            {index > 0 ? (
              <div className={styles.divider} aria-hidden="true" />
            ) : null}
            <section className={styles.group} aria-label={group.title}>
              <h3 className={styles.groupTitle}>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  aria-controls={`layer-group-${group.id}`}
                  onClick={() =>
                    setCollapsedGroupIds((current) =>
                      collapsed
                        ? current.filter((id) => id !== group.id)
                        : [...current, group.id],
                    )
                  }
                >
                  {group.title}
                  <ChevronDown aria-hidden="true" />
                </button>
              </h3>
              {group.description ? (
                <p className={styles.groupHint}>{group.description}</p>
              ) : null}
              <ul
                className={styles.list}
                id={`layer-group-${group.id}`}
                hidden={collapsed}
              >
                {layers.map((layer) => renderLayer(layer))}
              </ul>
            </section>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Renders every layer group from the domain registry as a checkbox list,
 * grouped under its title/description. Each layer shows its own
 * `description`, when it has one, beneath its label. An unavailable layer's
 * checkbox is disabled with a "Not yet available" badge; a failed-to-load
 * visible layer shows a "Failed to load" badge instead.
 * @remarks Every available layer also gets a download link per
 *   `dataSource` URL, so a visitor can save the exact GeoJSON the map
 *   renders, plus a CSV export button that fetches that same URL on click,
 *   flattens its properties (via `@karta/core`'s `featureCollectionToCsv`)
 *   and triggers a browser download; CSV isn't pre-generated like the
 *   static GeoJSON files, since it's a spreadsheet-friendly convenience
 *   format rather than something the map itself consumes. The checkbox's
 *   `<label>` wraps only the checkbox/text/badges, not the download
 *   link/button; nesting them inside that label too would make clicking
 *   them also toggle the checkbox, since a `<label>` forwards any click
 *   within it to its associated control. Memoized so unrelated re-renders of
 *   its parent (the info panel stays mounted, just `hidden`, so it re-renders
 *   on things like the mobile bottom-sheet's drag-frame updates) don't force
 *   this list back through reconciliation when its props haven't changed.
 */
export const LayerToggles = memo(LayerTogglesComponent);
