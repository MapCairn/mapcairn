import { formatShapeMeasure } from "@karta/core";
import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  Link,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { Ref } from "react";
import { useSettings } from "../../services";
import type { UseDraw } from "../../tools/DrawToolbar";
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

/**
 * The shapes the person has drawn: a list where each row selects a shape (so
 * it can be edited with the keyboard from the draw tool), buttons to delete
 * the selected shape or all of them, and the export buttons. Shapes are
 * saved to a file or into a link only when a button is pressed, and the note
 * says so.
 */
export function ShapesSection({
  draw,
  headingLevel = 3,
  headingRef,
}: ShapesSectionProps) {
  const { settings } = useSettings();
  const { shapes, selection, feedback } = draw;
  const subLevel = (headingLevel + 1) as HeadingLevel;
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
        {feedback ? (
          <p className={note} data-testid="shapes-feedback">
            <Icon
              icon={feedback.kind === "error" ? TriangleAlert : CircleCheck}
              className={noteIcon}
            />
            <span>{feedback.text}</span>
          </p>
        ) : null}
        <p className={prose}>
          Shapes stay in this browser and are not saved. Files are made on your
          device. A link with shapes holds them in its address, so anyone you
          send it to can see them.
        </p>
      </div>
    </Section>
  );
}
