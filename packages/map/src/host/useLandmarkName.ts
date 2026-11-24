// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue } from "@mapcairn/core";
import { useContext } from "react";
import { useMessages } from "../services";
import { MapContext } from "./MapContext";

/** The catalogue keys of the names of the interface's landmarks. */
export type LandmarkNameKey =
  | "host.map.label"
  | "tools.search.label"
  | "chrome.endStack.label"
  | "chrome.readout.label"
  | "chrome.attribution.label"
  | "tools.measure.region"
  | "tools.draw.region";

/**
 * The name of a landmark for a map with the given label. With no label it is
 * the landmark's own name, so one map reads as it always has. With one it is
 * the name and the label together (`host.map.named`), so the same landmark of
 * two maps has two names.
 */
export function landmarkName(
  { t }: MessageCatalogue,
  key: LandmarkNameKey,
  label: string | undefined,
): string {
  const name = t(key, {});
  return label ? t("host.map.named", { name, label }) : name;
}

/**
 * The accessible name of a landmark inside a `MapView`, with the label that
 * `MapView` was given. Outside a `MapView` it is the landmark's own name.
 */
export function useLandmarkName(key: LandmarkNameKey): string {
  const messages = useMessages();
  return landmarkName(messages, key, useContext(MapContext)?.label);
}
