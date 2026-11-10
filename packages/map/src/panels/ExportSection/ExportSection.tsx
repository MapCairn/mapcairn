import {
  announceImageBlocked,
  announceImageFailed,
  announceImageSaved,
  MapEngineError,
  type MapImageDrawing,
} from "@mapcairn/core";
import { Download } from "lucide-react";
import {
  type Ref,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
  /** Shapes drawn over the map, put into the image because the engine does not hold them. */
  readonly drawing?: MapImageDrawing;
  /**
   * The name of a basemap in use whose terms do not allow saving images (see
   * `imageExportBlockedBy`). While set, the button is off and the section
   * says why, in words the button's description points to.
   */
  readonly blockedBy?: string;
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
 *
 * @remarks The terms are checked again once the image is made: if a basemap
 *   whose terms forbid saved images came on screen meanwhile (a swap that
 *   started during the wait), the image is thrown away, not saved, and the
 *   refusal is announced. A refusal from the map itself is told apart from
 *   any other failure the same way, and every failure is logged.
 *
 *   With `blockedBy` the button keeps its place and focus but does
 *   nothing, and a visible paragraph names the basemap and the way out. The
 *   button's `aria-describedby` points at that paragraph, so a screen reader
 *   reads the reason with the button.
 */
export function ExportSection({
  credits,
  drawing,
  blockedBy,
  headingLevel = 3,
  headingRef,
}: ExportSectionProps) {
  // Read optionally, so the section also renders outside a map (a test, a guide).
  const adapter = useContext(MapContext)?.adapter ?? null;
  const announce = useAnnounce();
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<"blocked" | "failed" | null>(null);
  // The latest terms, read after the wait for the image.
  const blockedNow = useRef(blockedBy);
  blockedNow.current = blockedBy;
  // A failure told for one basemap's terms is not told again for another's:
  // when the terms change (come on or go away) the old message goes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `blockedBy` is the trigger; the effect reads nothing from it.
  useEffect(() => {
    setFailure(null);
  }, [blockedBy]);

  const save = async () => {
    if (!adapter || blockedBy !== undefined) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const options = {
        ...(credits ? { attribution: credits } : {}),
        ...(drawing ? { drawing } : {}),
      };
      const image = await adapter.toImage(
        Object.keys(options).length > 0 ? options : undefined,
      );
      if (blockedNow.current !== undefined) {
        // A basemap that forbids saved images arrived while the image was made.
        setFailure("blocked");
        announce(announceImageBlocked(blockedNow.current), {
          priority: "assertive",
        });
        return;
      }
      saveBlob(image, filenameFor(new Date()));
      announce(announceImageSaved(), { priority: "polite" });
    } catch (error) {
      console.error("The map image could not be saved.", error);
      if (
        error instanceof MapEngineError &&
        error.reason === "export-blocked"
      ) {
        setFailure("blocked");
        announce(announceImageBlocked(blockedNow.current), {
          priority: "assertive",
        });
      } else {
        setFailure("failed");
        announce(announceImageFailed(), { priority: "assertive" });
      }
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
      {blockedBy === undefined ? (
        <p className={prose}>
          Saves the map as it looks now, with its layers and credits, as a PNG
          file. It is made in your browser and sent nowhere.
        </p>
      ) : (
        <p className={prose} id={reasonId} data-testid="export-blocked">
          The terms of {blockedBy} do not allow saving images of its map. Choose
          another basemap to save an image.
        </p>
      )}
      <Button
        variant="secondary"
        icon={Download}
        busy={busy}
        disabled={!adapter || blockedBy !== undefined}
        aria-describedby={blockedBy === undefined ? undefined : reasonId}
        onClick={save}
        data-testid="save-image-button"
      >
        Save image
      </Button>
      {failure === "failed" ? (
        <p className={prose} data-testid="export-error">
          The map image could not be saved. Try again.
        </p>
      ) : null}
      {failure === "blocked" && blockedBy === undefined ? (
        <p className={prose} data-testid="export-error">
          The map image was not saved. The terms of the basemap do not allow
          saving images of its map. Choose another basemap to save an image.
        </p>
      ) : null}
    </Section>
  );
}
