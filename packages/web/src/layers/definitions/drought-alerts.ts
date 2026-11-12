// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/**
 * GDACS drought alerts. The event type `DR` comes from GDACS's documentation
 * and had no events when this was written (to confirm when one appears); a
 * wrong code only means the empty state.
 */
const droughtAlerts: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "drought-alerts",
  name: "Drought alerts",
  description: "Current droughts that GDACS rates for their impact on people.",
  group: "Floods, storms and droughts",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["DR"] } },
  emptyText: "No drought alerts right now.",
};

export default droughtAlerts;
