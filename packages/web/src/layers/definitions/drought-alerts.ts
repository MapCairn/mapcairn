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
  name: "layer.drought-alerts.name",
  description: "layer.drought-alerts.description",
  group: "layer.group.floodsStormsAndDroughts",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["DR"] } },
  emptyText: "layer.drought-alerts.emptyText",
};

export default droughtAlerts;
