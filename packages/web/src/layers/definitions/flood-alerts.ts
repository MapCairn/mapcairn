import type { FeedLayerDefinition } from "@karta/core";
import { GDACS_ALERTS } from "./gdacs/alerts";

/** GDACS flood alerts (event type `FL`). */
const floodAlerts: FeedLayerDefinition = {
  ...GDACS_ALERTS,
  id: "flood-alerts",
  name: "Flood alerts",
  description: "Current floods that GDACS rates for their impact on people.",
  group: "Floods, storms and droughts",
  source: { ...GDACS_ALERTS.source, filter: { field: "type", in: ["FL"] } },
  emptyText: "No flood alerts right now.",
};

export default floodAlerts;
