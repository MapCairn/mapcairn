// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/**
 * GDACS volcano alerts. The event type `VO` comes from GDACS's documentation
 * and had no events when this was written (to confirm when one appears); a
 * wrong code only means the empty state.
 */
const volcanoAlerts: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "volcano-alerts",
  name: "Volcano alerts",
  description:
    "Current volcanic eruptions that GDACS rates for their impact on people.",
  group: "Earthquakes and volcanoes",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["VO"] } },
  emptyText: "No volcano alerts right now.",
};

export default volcanoAlerts;
