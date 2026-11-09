import type { FeedLayerDefinition } from "@karta/core";

/** The parts every GDACS alert layer adds for itself. */
type OwnParts = "id" | "name" | "description" | "group" | "emptyText";

/**
 * What every GDACS alert layer shares: one feed of current events (about
 * 100, of every hazard), split into layers by event type with a filter. The
 * feed sends no `max-age`, so `cacheSeconds` lets the layers share one
 * response for five minutes. Cards show GDACS's own severity text, and the
 * alert level is a colour, a shape and words. An event's affected area loads
 * only when someone asks for it.
 */
export const GDACS_ALERTS: Omit<FeedLayerDefinition, OwnParts> = {
  dataCost: "about 135 KB",
  attribution: [
    {
      text: "Global Disaster Alert and Coordination System, GDACS",
      url: "https://www.gdacs.org/",
    },
  ],
  disclaimer:
    "GDACS alerts are automatic estimates from models. Check official sources before you act.",
  controls: [],
  source: {
    kind: "feed",
    url: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP",
    decoder: "geojson",
    cacheSeconds: 300,
    fields: {
      id: "properties.eventid",
      title: "properties.name",
      type: "properties.eventtype",
      level: "properties.alertlevel",
      score: "properties.alertscore",
      severity: "properties.severitydata.severitytext",
      country: "properties.country",
      from: "properties.fromdate",
      to: "properties.todate",
      report: "properties.url.report",
      area: "properties.url.geometry",
    },
  },
  style: {
    colour: {
      kind: "category",
      field: "level",
      categories: [
        {
          value: "Green",
          label: "Green alert",
          colour: "bluish-green",
          shape: "circle",
        },
        {
          value: "Orange",
          label: "Orange alert",
          colour: "orange",
          shape: "square",
        },
        {
          value: "Red",
          label: "Red alert",
          colour: "vermillion",
          shape: "triangle",
        },
      ],
      other: { label: "No alert level", colour: "sky-blue" },
    },
  },
  card: {
    title: "{title}",
    lines: [
      "{severity}",
      "{country}",
      "From {from|date}",
      "Last updated {to|date}",
    ],
    link: { field: "report", label: "Report on GDACS" },
  },
  list: {
    secondary: "{level} alert, {from|relative}",
    sorts: [
      { id: "newest", label: "Newest", field: "from", direction: "desc" },
      {
        id: "alert",
        label: "Highest alert",
        field: "score",
        direction: "desc",
      },
    ],
  },
  detail: {
    urlField: "area",
    origins: ["https://www.gdacs.org"],
    decoder: "geojson",
    colour: "blue",
    label: "Show affected area",
    dataCost: "about 300 KB",
  },
};
