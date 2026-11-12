// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/** GDACS wildfire alerts (event type `WF`). */
const fireAlerts: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "fire-alerts",
  name: "Fire alerts",
  description:
    "Current wildfires that GDACS rates for their impact on people, with the area burnt.",
  group: "Fires",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["WF"] } },
  emptyText: "No wildfire alerts right now.",
};

export default fireAlerts;
