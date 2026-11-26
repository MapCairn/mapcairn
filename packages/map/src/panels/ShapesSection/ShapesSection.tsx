// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  formatShapeMeasure,
  type MessageKey,
  type WktAxisOrder,
} from "@mapcairn/core";
import { useReadingDirection } from "@mapcairn/react";
import {
  CheckCircle,
  DownloadSimple,
  FileArrowUp,
  FileText,
  FileXls,
  Link,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { type Ref, useContext, useRef } from "react";
import { useChromeLayout } from "../../chrome/layoutContext";
import { MapContext } from "../../host";
import { dateInput, field } from "../../layers/Layers.css";
import { FIT_MAX_ZOOM, fitPadding } from "../../layers/reveal";
import { useFileOpener, useMessages, useSettings } from "../../services";
import type { DrawFeedback, UseDraw } from "../../tools/DrawToolbar";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ListRow } from "../../ui/ListRow";
import { type HeadingLevel, Section, Subheading } from "../Section";
import { note, noteIcon, prose, subsection } from "../Section/Section.css";
import { actions, list } from "./ShapesSection.css";

/** Props for {@link ShapesSection}. */
export interface ShapesSectionProps {
  /** The drawing state from `useDraw`. */
  readonly draw: UseDraw;
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** The button that reads the offered file in the other WKT axis order, by the order it offers. */
const REREAD_KEYS = {
  "lat-lng": "panels.shapes.axisReread.lat-lng",
  "lng-lat": "panels.shapes.axisReread.lng-lat",
} as const satisfies Readonly<Record<WktAxisOrder, MessageKey>>;

/** The outcome of an import, export or copy, in words with an icon. */
function Feedback({
  feedback,
  testId,
}: {
  readonly feedback: DrawFeedback | null;
  readonly testId: string;
}) {
  if (!feedback) {
    return null;
  }
  return (
    <p className={note} data-testid={testId}>
      <Icon
        icon={feedback.kind === "error" ? Warning : CheckCircle}
        className={noteIcon}
      />
      <span>{feedback.text}</span>
    </p>
  );
}

/**
 * Fits the map to imported shapes in the part the sheet or side panel leaves
 * free, as Show on map does for a feature.
 */
function useFitToImport(): (bounds: Bounds) => void {
  const adapter = useContext(MapContext)?.adapter ?? null;
  const { layout, viewport, panelEdge } = useChromeLayout();
  const direction = useReadingDirection();
  return (bounds) => {
    if (!adapter) {
      return;
    }
    adapter.fitBounds(bounds, {
      maxZoom: FIT_MAX_ZOOM,
      padding: fitPadding({ layout, viewport, panelEdge, direction }),
    });
  };
}

/**
 * The shapes the person has drawn: a list where each row selects a shape (so
 * it can be edited with the keyboard from the draw tool), buttons to delete
 * the selected shape or all of them, an import from a GeoJSON, GPX, KML, CSV or WKT file
 * (when the host supplies a file opener),
 * and the export buttons. Shapes are saved to a file or into a link only when
 * a button is pressed, a file is read only on this device, and the note says
 * so. The map fits to what an import added.
 */
export function ShapesSection({
  draw,
  headingLevel = 3,
  headingRef,
}: ShapesSectionProps) {
  const { settings } = useSettings();
  const messages = useMessages();
  const { t } = messages;
  const { shapes, selection, feedback, importFeedback } = draw;
  const subLevel = (headingLevel + 1) as HeadingLevel;
  const fitToImport = useFitToImport();
  const canImport = useFileOpener() !== undefined;
  const readAs = importFeedback?.readAs;
  const orderRef = useRef<HTMLSelectElement>(null);
  const importFile = () => {
    // Called straight from the press, so the browser shows the picker.
    void draw.importFile().then((bounds) => {
      if (bounds) {
        fitToImport(bounds);
      }
    });
  };
  const reread = (order: WktAxisOrder) => {
    // The button that was pressed goes with the offer, so focus moves to the control it set.
    orderRef.current?.focus();
    const bounds = draw.rereadImport(order);
    if (bounds) {
      fitToImport(bounds);
    }
  };
  return (
    <Section
      title={t("panels.shapes.title", {})}
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-shapes"
    >
      {shapes.length === 0 ? (
        <p className={prose} data-testid="shapes-empty">
          {t("panels.shapes.empty", {})}
        </p>
      ) : (
        <ul
          className={list}
          aria-label={t("panels.shapes.listLabel", {})}
          data-testid="shapes-list"
        >
          {shapes.map((shape) => (
            <ListRow
              key={shape.id}
              label={
                shape.done
                  ? shape.label
                  : t("panels.shapes.unfinished", { label: shape.label })
              }
              secondary={
                formatShapeMeasure(shape, settings.units, messages) || undefined
              }
              selected={selection?.shapeId === shape.id}
              data-testid="shapes-row"
              onClick={() => draw.select(shape.id)}
            />
          ))}
        </ul>
      )}
      <div className={actions}>
        <Button
          variant="secondary"
          icon={Trash}
          disabled={selection === null}
          data-testid="shapes-delete"
          onClick={draw.deleteSelected}
        >
          {t("panels.shapes.deleteSelected", {})}
        </Button>
        <Button
          variant="secondary"
          icon={Trash}
          disabled={shapes.length === 0}
          data-testid="shapes-clear"
          onClick={draw.clear}
        >
          {t("panels.shapes.deleteAll", {})}
        </Button>
      </div>
      {canImport ? (
        <div className={subsection}>
          <Subheading level={subLevel}>
            {t("panels.shapes.importHeading", {})}
          </Subheading>
          <label className={field}>
            {t("panels.shapes.axisOrderLabel", {})}
            <select
              ref={orderRef}
              className={dateInput}
              value={draw.wktAxisOrder}
              data-testid="shapes-axis-order"
              onChange={(event) =>
                draw.setWktAxisOrder(event.target.value as WktAxisOrder)
              }
            >
              <option value="lng-lat">
                {t("panels.shapes.axisOrder.lng-lat", {})}
              </option>
              <option value="lat-lng">
                {t("panels.shapes.axisOrder.lat-lng", {})}
              </option>
            </select>
          </label>
          <div className={actions}>
            <Button
              variant="secondary"
              icon={FileArrowUp}
              data-testid="shapes-import"
              onClick={importFile}
            >
              {t("panels.shapes.import", {})}
            </Button>
          </div>
          <Feedback feedback={importFeedback} testId="shapes-import-feedback" />
          {readAs ? (
            <div className={actions}>
              <Button
                variant="secondary"
                data-testid="shapes-import-reread"
                onClick={() => reread(readAs)}
              >
                {t(REREAD_KEYS[readAs], {})}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={subsection}>
        <Subheading level={subLevel}>
          {t("panels.shapes.exportHeading", {})}
        </Subheading>
        <div className={actions}>
          <Button
            variant="secondary"
            icon={DownloadSimple}
            data-testid="shapes-export-geojson"
            onClick={() => void draw.exportGeoJson()}
          >
            {t("panels.shapes.downloadGeoJson", {})}
          </Button>
          <Button
            variant="secondary"
            icon={FileXls}
            data-testid="shapes-export-csv"
            onClick={() => void draw.exportCsv()}
          >
            {t("panels.shapes.downloadCsv", {})}
          </Button>
          <Button
            variant="secondary"
            icon={FileText}
            data-testid="shapes-export-wkt"
            onClick={() => void draw.exportWkt()}
          >
            {t("panels.shapes.downloadWkt", {})}
          </Button>
          <Button
            variant="secondary"
            icon={Link}
            data-testid="shapes-copy-link"
            onClick={() => void draw.copyLink()}
          >
            {t("panels.shapes.copyLink", {})}
          </Button>
        </div>
        <Feedback feedback={feedback} testId="shapes-feedback" />
        <p className={prose}>{t("panels.shapes.storageNote", {})}</p>
      </div>
    </Section>
  );
}
