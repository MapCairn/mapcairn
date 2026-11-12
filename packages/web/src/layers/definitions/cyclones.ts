// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/** GDACS tropical cyclone alerts (event type `TC`), with wind speed in the severity text. */
const cyclones: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "cyclones",
  name: "Tropical cyclones",
  description:
    "Current tropical storms and cyclones with their strongest winds. Show affected area draws the track and wind zones.",
  group: "Floods, storms and droughts",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["TC"] } },
  emptyText: "No tropical cyclone alerts right now.",
};

export default cyclones;
