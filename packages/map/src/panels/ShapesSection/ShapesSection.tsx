import { type Bounds, formatShapeMeasure } from "@mapcairn/core";
import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileUp,
  Link,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type Ref, useContext } from "react";
import { useChromeLayout } from "../../chrome/layoutContext";
import { MapContext } from "../../host";
import { fitPadding } from "../../layers/reveal";
import { useSettings } from "../../services";
import type { DrawFeedback, UseDraw } from "../../tools/DrawToolbar";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ListRow } from "../../ui/ListRow";
import { type HeadingLevel, Section, Subheading } from "../Section";
import { note, noteIcon, prose, subsection } from "../Section/Section.css";
import { actions, list } from "./ShapesSection.css";

/** The closest the map zooms to fit imported shapes, so a single point keeps its surroundings. */
const IMPORT_FIT_MAX_ZOOM = 16;

/** Props for {@link ShapesSection}. */
export interface ShapesSectionProps {
  /** The drawing state from `useDraw`. */
  readonly draw: UseDraw;
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  /** Receives the heading, so the sheet can focus it. */
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

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
        icon={feedback.kind === "error" ? TriangleAlert : CircleCheck}
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
  return (bounds) => {
    if (!adapter) {
      return;
    }
    adapter.fitBounds(bounds, {
      maxZoom: IMPORT_FIT_MAX_ZOOM,
      padding: fitPadding({ layout, viewport, panelEdge }),
    });
  };
}

/**
 * The shapes the person has drawn: a list where each row selects a shape (so
 * it can be edited with the keyboard from the draw tool), buttons to delete
 * the selected shape or all of them, an import from a GeoJSON or CSV file,
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
  const { shapes, selection, feedback, importFeedback } = draw;
  const subLevel = (headingLevel + 1) as HeadingLevel;
  const fitToImport = useFitToImport();
  const importFile = () => {
    // Called straight from the press, so the browser shows the picker.
    void draw.importFile().then((bounds) => {
      if (bounds) {
        fitToImport(bounds);
      }
    });
  };
  return (
    <Section
      title="Shapes"
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-shapes"
    >
      {shapes.length === 0 ? (
        <p className={prose} data-testid="shapes-empty">
          Nothing drawn yet. Choose Draw shapes on the map to start.
        </p>
      ) : (
        <ul
          className={list}
          aria-label="Drawn shapes"
          data-testid="shapes-list"
        >
          {shapes.map((shape) => (
            <ListRow
              key={shape.id}
              label={shape.done ? shape.label : `${shape.label}, unfinished`}
              secondary={formatShapeMeasure(shape, settings.units) || undefined}
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
          icon={Trash2}
          disabled={selection === null}
          data-testid="shapes-delete"
          onClick={draw.deleteSelected}
        >
          Delete selected shape
        </Button>
        <Button
          variant="secondary"
          icon={Trash2}
          disabled={shapes.length === 0}
          data-testid="shapes-clear"
          onClick={draw.clear}
        >
          Delete all shapes
        </Button>
      </div>
      <div className={subsection}>
        <Subheading level={subLevel}>Import</Subheading>
        <div className={actions}>
          <Button
            variant="secondary"
            icon={FileUp}
            data-testid="shapes-import"
            onClick={importFile}
          >
            Import GeoJSON or CSV
          </Button>
        </div>
        <Feedback feedback={importFeedback} testId="shapes-import-feedback" />
      </div>
      <div className={subsection}>
        <Subheading level={subLevel}>Export</Subheading>
        <div className={actions}>
          <Button
            variant="secondary"
            icon={Download}
            data-testid="shapes-export-geojson"
            onClick={() => void draw.exportGeoJson()}
          >
            Download GeoJSON
          </Button>
          <Button
            variant="secondary"
            icon={FileSpreadsheet}
            data-testid="shapes-export-csv"
            onClick={() => void draw.exportCsv()}
          >
            Download CSV
          </Button>
          <Button
            variant="secondary"
            icon={Link}
            data-testid="shapes-copy-link"
            onClick={() => void draw.copyLink()}
          >
            Copy link with shapes
          </Button>
        </div>
        <Feedback feedback={feedback} testId="shapes-feedback" />
        <p className={prose}>
          Shapes stay in this browser and are not saved. Files are made and read
          on your device, and nothing is uploaded. A link with shapes holds them
          in its address, so anyone you send it to can see them.
        </p>
      </div>
    </Section>
  );
}
