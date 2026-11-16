// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/** GDACS tropical cyclone alerts (event type `TC`), with wind speed in the severity text. */
const cyclones: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "cyclones",
  name: "layer.cyclones.name",
  description: "layer.cyclones.description",
  group: "layer.group.floodsStormsAndDroughts",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["TC"] } },
  emptyText: "layer.cyclones.emptyText",
};

export default cyclones;
