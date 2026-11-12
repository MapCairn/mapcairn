// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { CATEGORICAL_SLOTS, ORDINAL_SLOTS } from "@mapcairn/core";
import type {
  ServerField,
  ServerFieldType,
  ServerLayer,
  ServerLayerList,
  ServerRenderer,
  TileService,
} from "./serverMetadata";

/**
 * What the mapper makes of one server layer: shaped like a layer definition,
 * but not trusted to be one. The runtime catalogue checks each candidate on
 * its own, so a layer the server describes in a way the mapper cannot use is
 * skipped there, with the path of each problem, and costs one layer.
 */
export type LayerCandidate = Readonly<Record<string, unknown>>;

const LAYER_GROUP = "Sample server";
const EMPTY_TEXT = "No features to show.";
const TITLE_KEY = "title";
const ID_KEY = "id";

/** The names a card template can read. */
const FIELD_NAME = /^[a-zA-Z0-9_-]+$/;

/** The formatter that shows a field of each type, where one is not plain text. */
const FORMATTER_BY_TYPE: Readonly<Partial<Record<ServerFieldType, string>>> = {
  integer: "number",
  double: "number",
  date: "date",
};

const NUMERIC_TYPES: readonly ServerFieldType[] = ["integer", "double"];

/** A server's id as a layer id: lowercase letters, digits and hyphens. */
function layerId(serverId: string): string {
  return serverId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A server's text with the braces taken out, so it cannot open a template placeholder. */
function plain(text: string): string {
  return text.replace(/[{}]/g, "");
}

function propertyPath(field: ServerField): string {
  return `properties.${field.name}`;
}

/** The template that shows a field, through the formatter its type calls for. */
function placeholder(field: ServerField): string {
  const formatter = FORMATTER_BY_TYPE[field.type];
  return formatter === undefined
    ? `{${field.name}}`
    : `{${field.name}|${formatter}}`;
}

/**
 * The attributes of a layer sorted by what the mapper does with them: the
 * first object id identifies a feature, the first text attribute titles it,
 * and every other attribute with a name a template can read is shown. An
 * attribute of a type a card cannot show (a blob) is left out.
 */
interface FieldRoles {
  readonly id: ServerField | undefined;
  readonly title: ServerField | undefined;
  readonly shown: readonly ServerField[];
}

function fieldRoles(fields: readonly ServerField[]): FieldRoles {
  const usable = fields.filter(
    (field) => FIELD_NAME.test(field.name) && field.type !== "blob",
  );
  const id = usable.find((field) => field.type === "oid");
  const title = usable.find((field) => field.type === "string");
  return {
    id,
    title,
    shown: usable.filter((field) => field !== id && field !== title),
  };
}

/**
 * The field map of a feed. A layer with no text attribute has no `title`, and
 * the catalogue skips it with `source.fields.title: is required`.
 */
function fieldMap(roles: FieldRoles): Readonly<Record<string, string>> {
  const named: [string, ServerField][] = roles.shown.map((field) => [
    field.name,
    field,
  ]);
  if (roles.id) {
    named.push([ID_KEY, roles.id]);
  }
  if (roles.title) {
    named.push([TITLE_KEY, roles.title]);
  }
  return Object.fromEntries(
    named.map(([key, field]) => [key, propertyPath(field)]),
  );
}

function cardLine(field: ServerField): string {
  return `${plain(field.label)}: ${placeholder(field)}`;
}

function card(roles: FieldRoles): LayerCandidate {
  return {
    title: `{${TITLE_KEY}}`,
    lines: roles.shown.map(cardLine),
  };
}

/** The list sorts by title and by each number, largest first. */
function listSorts(roles: FieldRoles): readonly LayerCandidate[] {
  const byTitle = roles.title
    ? [{ id: "name", label: "Name", field: TITLE_KEY, direction: "asc" }]
    : [];
  const byNumber = roles.shown
    .filter((field) => NUMERIC_TYPES.includes(field.type))
    .map((field) => ({
      id: `by-${layerId(field.name)}`,
      label: plain(field.label),
      field: field.name,
      direction: "desc",
    }));
  return [...byTitle, ...byNumber];
}

function listSpec(roles: FieldRoles): LayerCandidate {
  const [firstLine] = roles.shown.map(cardLine);
  return {
    secondary: firstLine ?? `{${TITLE_KEY}}`,
    sorts: listSorts(roles),
  };
}

/**
 * The colour rule of a renderer. Colours come from the SDK's palette in
 * order, never from the server, so a legend is readable on any basemap. A
 * rule with more classes than the palette has colours gets a missing colour,
 * which the catalogue reports against the class that has none.
 */
function colourRule(renderer: ServerRenderer): LayerCandidate {
  switch (renderer.type) {
    case "simple":
      return {
        kind: "fixed",
        colour: CATEGORICAL_SLOTS[0],
        label: renderer.label,
      };
    case "uniqueValue":
      return {
        kind: "category",
        field: renderer.field,
        categories: renderer.values.map((item, index) => ({
          value: item.value,
          label: item.label,
          colour: CATEGORICAL_SLOTS[index],
        })),
        other: {
          label: renderer.otherLabel,
          colour: CATEGORICAL_SLOTS[renderer.values.length],
        },
      };
    case "classBreaks":
      return {
        kind: "steps",
        field: renderer.field,
        steps: renderer.breaks.map((item, index) => ({
          min: item.min,
          label: item.label,
          colour: ORDINAL_SLOTS[index],
        })),
      };
    case "equalInterval":
      return {
        kind: "intervals",
        field: renderer.field,
        min: renderer.min,
        max: renderer.max,
        ramp: Array.from(
          { length: renderer.classes },
          (_, index) => ORDINAL_SLOTS[index],
        ),
        ...(renderer.unit === undefined ? {} : { unit: renderer.unit }),
      };
  }
}

/**
 * A polygon's or line's label, which names the field the colour reads. The
 * SDK requires it (or a pattern, dash or width that differs in every class)
 * so that colour is never the only signal.
 */
function shapeLabel(
  renderer: ServerRenderer,
  roles: FieldRoles,
): LayerCandidate | undefined {
  if (renderer.type === "simple") {
    return undefined;
  }
  const field = roles.shown.find((item) => item.name === renderer.field);
  const shown = field ? placeholder(field) : `{${renderer.field}}`;
  return { template: `{${TITLE_KEY}}: ${shown}` };
}

/**
 * The style of a layer. A point layer's colour rule is its whole style; a
 * polygon or polyline layer is drawn as an area or a line. A geometry the
 * mapper has no style for gets none, and the catalogue reports `style`.
 */
function style(
  layer: ServerLayer,
  roles: FieldRoles,
): LayerCandidate | undefined {
  const colour = colourRule(layer.renderer);
  switch (layer.geometryType) {
    case "point":
      return { colour };
    case "polygon":
    case "polyline": {
      const label = shapeLabel(layer.renderer, roles);
      return {
        kind: "shapes",
        geometry: layer.geometryType === "polygon" ? "area" : "line",
        colour,
        ...(label === undefined ? {} : { label }),
      };
    }
    default:
      return undefined;
  }
}

function filter(layer: ServerLayer): LayerCandidate | undefined {
  const { visibleValues } = layer;
  return visibleValues === undefined
    ? undefined
    : { field: visibleValues.field, in: visibleValues.values };
}

/** What every definition has, whatever it draws. */
function common(layer: ServerLayer): LayerCandidate {
  const { text, url } = layer.credit;
  return {
    id: layerId(layer.id),
    name: layer.title,
    description: layer.description,
    group: LAYER_GROUP,
    dataCost: layer.approximateSize,
    attribution: [url === undefined ? { text } : { text, url }],
    controls: [],
  };
}

function tileLayer(layer: ServerLayer, service: TileService): LayerCandidate {
  return {
    ...common(layer),
    source: {
      kind: "tiles",
      tiles: service.url,
      tileSize: service.tileSize,
      maxzoom: service.maxZoom,
    },
    legend: service.legend.map((entry, index) => ({
      label: entry.label,
      colour: ORDINAL_SLOTS[index],
    })),
  };
}

function featureLayer(layer: ServerLayer, url: string): LayerCandidate {
  const roles = fieldRoles(layer.fields);
  const where = filter(layer);
  return {
    ...common(layer),
    source: {
      kind: "feed",
      url,
      decoder: "geojson",
      fields: fieldMap(roles),
      ...(where === undefined ? {} : { filter: where }),
    },
    style: style(layer, roles),
    card: card(roles),
    list: listSpec(roles),
    emptyText: EMPTY_TEXT,
  };
}

/**
 * Turns what a server says about its layers into layer definitions, as a
 * host with a server of its own would. It uses only what the SDK already
 * offers:
 *
 * - A field list becomes the field map, the card and list templates, the
 *   sorts, and a filter. The first object id identifies a feature and the
 *   first text field titles it. Numbers and dates are shown through the
 *   built-in `number` and `date` formatters, and a blob is left out.
 * - A renderer becomes a style, and the legend is derived from it by
 *   `legendFor`: unique values become categories, class breaks become
 *   `steps`, and equal intervals become `intervals` (areas and lines only,
 *   because the SDK's point styles take `steps`). The palette has five
 *   ordinal colours and seven categorical ones, so a rule has at most five
 *   classes, or six values and the class for every other value.
 * - A feature service becomes a feed and a tile service a raster layer whose
 *   legend is the server's.
 *
 * It does not check what it makes: a field list it cannot use, such as one
 * with no text field, produces a candidate the catalogue skips with the
 * path of each problem, so the rules stay in one place.
 */
export function mapServerLayers(
  server: ServerLayerList,
): readonly LayerCandidate[] {
  return server.layers.map((layer) =>
    layer.service.kind === "tiles"
      ? tileLayer(layer, layer.service)
      : featureLayer(layer, layer.service.url),
  );
}
