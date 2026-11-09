import { announceImageFailed, announceImageSaved } from "@karta/core";
import { Download } from "lucide-react";
import { type Ref, useContext, useState } from "react";
import { MapContext } from "../../host";
import { Button } from "../../ui/Button";
import { useAnnounce } from "../../ui/LiveRegion";
import { type HeadingLevel, Section } from "../Section";
import { prose } from "../Section/Section.css";

/** Props for {@link ExportSection}. */
export interface ExportSectionProps {
  /**
   * The credits drawn along the bottom of the saved image, such as the
   * basemap's and those of the layers that are on (see `creditsLine`).
   */
  readonly credits?: string;
  /** The heading level. Defaults to 3, below the sheet's h2 title. */
  readonly headingLevel?: HeadingLevel;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

/** Hands a blob to the browser as a file download, then frees it. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // The download has started by the time the task ends.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `map-2026-11-09.png`: the day it was saved, in the person's own time. */
function filenameFor(date: Date): string {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `map-${day}.png`;
}

/**
 * Saves the map as it looks now, with its layers and credits, as a PNG file.
 * The image is drawn in the browser from what the map has already loaded, so
 * nothing is requested or sent anywhere. A plain button, so it works from the
 * keyboard; the result is announced through the shared live region.
 */
export function ExportSection({
  credits,
  headingLevel = 3,
  headingRef,
}: ExportSectionProps) {
  // Read optionally, so the section also renders outside a map (a test, a guide).
  const adapter = useContext(MapContext)?.adapter ?? null;
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    if (!adapter) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const image = await adapter.toImage(
        credits ? { attribution: credits } : undefined,
      );
      saveBlob(image, filenameFor(new Date()));
      announce(announceImageSaved(), { priority: "polite" });
    } catch {
      setFailed(true);
      announce(announceImageFailed(), { priority: "assertive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Save image"
      headingLevel={headingLevel}
      headingRef={headingRef}
      data-testid="sheet-section-export"
    >
      <p className={prose}>
        Saves the map as it looks now, with its layers and credits, as a PNG
        file. It is made in your browser and sent nowhere.
      </p>
      <Button
        variant="secondary"
        icon={Download}
        busy={busy}
        disabled={!adapter}
        onClick={save}
        data-testid="save-image-button"
      >
        Save image
      </Button>
      {failed ? (
        <p className={prose} data-testid="export-error">
          The map image could not be saved. Try again.
        </p>
      ) : null}
    </Section>
  );
}
