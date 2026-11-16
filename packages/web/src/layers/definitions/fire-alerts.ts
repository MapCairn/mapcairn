// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/** GDACS wildfire alerts (event type `WF`). */
const fireAlerts: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "fire-alerts",
  name: "layer.fire-alerts.name",
  description: "layer.fire-alerts.description",
  group: "layer.group.fires",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["WF"] } },
  emptyText: "layer.fire-alerts.emptyText",
};

export default fireAlerts;
