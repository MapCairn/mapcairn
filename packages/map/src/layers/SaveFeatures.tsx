// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  canSaveFeatures,
  creditLines,
  type FeatureFileFormat,
  type FeatureFileInfo,
  featuresToCsv,
  featuresToGeoJsonText,
  MAX_SAVED_FEATURES,
  type Message,
  message,
  type SavedFeatureSet,
  type SavedFile,
  savedFeatureSet,
  savedFileName,
} from "@mapcairn/core";
import { DownloadSimple, FileXls } from "@phosphor-icons/react";
import { useState } from "react";
import {
  useFileSaver,
  useFormatMessage,
  useMessages,
  useResolveText,
} from "../services";
import { Button } from "../ui/Button";
import { useAnnounce } from "../ui/LiveRegion";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import * as styles from "./Layers.css";
import type { DataLayerState } from "./useDataLayers";

/** What each file type is saved as. */
const FILE_TYPES: Record<
  FeatureFileFormat,
  { readonly mimeType: string; readonly build: typeof featuresToCsv }
> = {
  geojson: { mimeType: "application/geo+json", build: featuresToGeoJsonText },
  csv: { mimeType: "text/csv;charset=utf-8", build: featuresToCsv },
};

/** What is said once a file is saved: how many features it holds, and how many the cap left out. */
function savedMessage(
  set: SavedFeatureSet,
  name: string,
  filename: string,
): Message {
  if (set.capped) {
    return message("layers.save.doneCapped", {
      count: set.kept.length,
      total: set.total,
      name,
      filename,
    });
  }
  return message("layers.save.done", {
    count: set.kept.length,
    name,
    filename,
  });
}

/** Props for {@link SaveFeatures}. */
export interface SaveFeaturesProps {
  /** The layer, with the features it holds. */
  readonly layer: DataLayerState;
  /** The day to write in the file, `YYYY-MM-DD` in UTC. */
  readonly savedOn: string;
}

/**
 * Buttons that save the features a layer holds as GeoJSON or CSV, for a layer
 * whose definition allows it (`saveFeatures`). Nothing is requested again:
 * the file is built from the decoded features in memory, up to
 * {@link MAX_SAVED_FEATURES}, and handed to the file saver. The outcome is
 * announced and also written beside the buttons.
 */
export function SaveFeatures({ layer, savedOn }: SaveFeaturesProps) {
  const { definition, features } = layer;
  const saver = useFileSaver();
  const messages = useMessages();
  const resolve = useResolveText();
  const format = useFormatMessage();
  const announce = useAnnounce();
  const [outcome, setOutcome] = useState<string | null>(null);
  if (!canSaveFeatures(definition) || features.length === 0) {
    return null;
  }
  const name = resolve(definition.name);
  const { t } = messages;

  const save = async (type: FeatureFileFormat) => {
    const set = savedFeatureSet(features);
    const info: FeatureFileInfo = {
      layerName: name,
      credits: creditLines(definition.attribution, savedOn.slice(0, 4)),
      savedOn,
    };
    const file: SavedFile = {
      filename: savedFileName(definition.id, savedOn, type),
      mimeType: FILE_TYPES[type].mimeType,
      content: FILE_TYPES[type].build(set.kept, info),
    };
    const result = await saver.save(file);
    const said = result.ok
      ? savedMessage(set, name, file.filename)
      : message("layers.save.failed", {});
    setOutcome(format(said));
    announce(said, { priority: result.ok ? "polite" : "assertive" });
  };

  return (
    <fieldset
      className={styles.saveFeatures}
      data-testid={`layer-save-${definition.id}`}
    >
      <VisuallyHidden as="legend">
        {t("layers.save.group", { name })}
      </VisuallyHidden>
      <p className={styles.muted}>
        {t("layers.save.note", { max: MAX_SAVED_FEATURES })}
      </p>
      <div className={styles.saveActions}>
        <Button
          variant="secondary"
          icon={DownloadSimple}
          data-testid={`layer-save-geojson-${definition.id}`}
          onClick={() => void save("geojson")}
        >
          {t("layers.save.geojson", {})}
        </Button>
        <Button
          variant="secondary"
          icon={FileXls}
          data-testid={`layer-save-csv-${definition.id}`}
          onClick={() => void save("csv")}
        >
          {t("layers.save.csv", {})}
        </Button>
      </div>
      {outcome === null ? null : (
        <p
          className={styles.muted}
          data-testid={`layer-save-status-${definition.id}`}
        >
          {outcome}
        </p>
      )}
    </fieldset>
  );
}
