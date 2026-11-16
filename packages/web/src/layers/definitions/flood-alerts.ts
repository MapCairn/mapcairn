// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/** GDACS flood alerts (event type `FL`). */
const floodAlerts: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "flood-alerts",
  name: "layer.flood-alerts.name",
  description: "layer.flood-alerts.description",
  group: "layer.group.floodsStormsAndDroughts",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["FL"] } },
  emptyText: "layer.flood-alerts.emptyText",
};

export default floodAlerts;
