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

/**
 * The candidate for a layer whose metadata the mapper cannot read at all, such
 * as one with no `credit`. It is not an object, so the catalogue skips it
 * with `definition: must be an object` and no id, and the layers around it
 * are unaffected.
 */
const UNREADABLE_LAYER = null;

const LAYER_GROUP = "Sample server";
const EMPTY_TEXT = "No features to show.";
const TITLE_KEY = "title";
const ID_KEY = "id";

// The next two patterns restate rules core keeps to itself: the name a card
// template placeholder may have (`PLACEHOLDER` in
// `packages/core/src/layers/template.ts`) and the form of a layer id (`ID` in
// `packages/core/src/layers/validateSupport.ts`). Neither is exported, so a
// host mapper restates them too; if core changes one, change it here.

/** The names a card template can read. */
const FIELD_NAME = /^[a-zA-Z0-9_-]+$/;

/** What is not a letter or a digit in a server's id, which becomes a hyphen. */
const NOT_ID_CHARACTER = /[^a-z0-9]+/g;

/** Decoded field names the SDK reads itself, so no other field may take them. */
const RESERVED_KEYS: readonly string[] = [ID_KEY, TITLE_KEY];

/** One more than the palette has, so a rule with too many classes still reaches validation. */
const MAX_RAMP_LENGTH = ORDINAL_SLOTS.length + 1;

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
    .replace(NOT_ID_CHARACTER, "-")
    .replace(/^-+|-+$/g, "");
}

/** A server's text with the braces taken out, so it cannot open a template placeholder. */
function plain(text: string): string {
  return text.replace(/[{}]/g, "");
}

/** A server field and the name its decoded value has in the field map. */
interface DecodedField {
  readonly field: ServerField;
  readonly key: string;
}

/**
 * The attributes of a layer sorted by what the mapper does with them: the
 * first object id identifies a feature (decoded as `id`), the first text
 * attribute titles it (decoded as `title`), and every other attribute with a
 * name a template can read is shown under its own name. A shown attribute
 * called `id` or `title` is renamed, so it cannot replace the two. An
 * attribute of a type a card cannot show (a blob) is left out.
 */
interface FieldRoles {
  readonly id: DecodedField | undefined;
  readonly title: DecodedField | undefined;
  readonly shown: readonly DecodedField[];
}

function shownKey(field: ServerField): string {
  return RESERVED_KEYS.includes(field.name)
    ? `${field.name}-field`
    : field.name;
}

function fieldRoles(fields: readonly ServerField[]): FieldRoles {
  const usable = fields.filter(
    (field) => FIELD_NAME.test(field.name) && field.type !== "blob",
  );
  const id = usable.find((field) => field.type === "oid");
  const title = usable.find((field) => field.type === "string");
  return {
    id: id && { field: id, key: ID_KEY },
    title: title && { field: title, key: TITLE_KEY },
    shown: usable
      .filter((field) => field !== id && field !== title)
      .map((field) => ({ field, key: shownKey(field) })),
  };
}

/** The decoded field a server field name refers to, if the mapper kept it. */
function findDecoded(
  roles: FieldRoles,
  serverName: string,
): DecodedField | undefined {
  return [roles.id, roles.title, ...roles.shown].find(
    (item) => item?.field.name === serverName,
  );
}

/**
 * The decoded name for a server field name, which a style, a filter or a sort
 * uses. A name the mapper did not keep stays as it is, and the catalogue
 * reports it as not a field.
 */
function decodedKey(roles: FieldRoles, serverName: string): string {
  return findDecoded(roles, serverName)?.key ?? serverName;
}

/** The template that shows a field, through the formatter its type calls for. */
function placeholder({ field, key }: DecodedField): string {
  const formatter = FORMATTER_BY_TYPE[field.type];
  return formatter === undefined ? `{${key}}` : `{${key}|${formatter}}`;
}

/**
 * The field map of a feed. A layer with no text attribute has no `title`, and
 * one with no object id has no `id`: the catalogue skips it with
 * `source.fields.title: is required` or `source.fields.id: is required`.
 */
function fieldMap(roles: FieldRoles): Readonly<Record<string, string>> {
  const decoded = [...roles.shown, roles.id, roles.title].filter(
    (item): item is DecodedField => item !== undefined,
  );
  return Object.fromEntries(
    decoded.map(({ field, key }) => [key, `properties.${field.name}`]),
  );
}

function cardLine(decoded: DecodedField): string {
  return `${plain(decoded.field.label)}: ${placeholder(decoded)}`;
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
    .filter(({ field }) => NUMERIC_TYPES.includes(field.type))
    .map(({ field, key }, index) => ({
      id: `by-number-${index + 1}`,
      label: plain(field.label),
      field: key,
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
 * which the catalogue reports against the class that has none. The ramp of
 * equal intervals is cut at one past the palette, so a server's absurd class
 * count reaches the catalogue's check and is skipped, and is never counted.
 */
function colourRule(
  renderer: ServerRenderer,
  roles: FieldRoles,
): LayerCandidate {
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
        field: decodedKey(roles, renderer.field),
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
        field: decodedKey(roles, renderer.field),
        steps: renderer.breaks.map((item, index) => ({
          min: item.min,
          label: item.label,
          colour: ORDINAL_SLOTS[index],
        })),
      };
    case "equalInterval":
      return {
        kind: "intervals",
        field: decodedKey(roles, renderer.field),
        min: renderer.min,
        max: renderer.max,
        ramp: Array.from(
          { length: Math.min(renderer.classes, MAX_RAMP_LENGTH) },
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
  const decoded = findDecoded(roles, renderer.field);
  const shown = decoded ? placeholder(decoded) : `{${renderer.field}}`;
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
  const colour = colourRule(layer.renderer, roles);
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

function filter(
  layer: ServerLayer,
  roles: FieldRoles,
): LayerCandidate | undefined {
  const { visibleValues } = layer;
  return visibleValues === undefined
    ? undefined
    : {
        field: decodedKey(roles, visibleValues.field),
        in: visibleValues.values,
      };
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
  const where = filter(layer, roles);
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

/** One layer's candidate, or {@link UNREADABLE_LAYER} when its metadata cannot be read. */
function mapLayer(layer: ServerLayer): LayerCandidate | null {
  try {
    return layer.service.kind === "tiles"
      ? tileLayer(layer, layer.service)
      : featureLayer(layer, layer.service.url);
  } catch {
    // A property the server left out or got wrong costs this layer, not the list.
    return UNREADABLE_LAYER;
  }
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
 *   classes, or six values and the class for every other value, and equal
 *   intervals need at least two classes.
 * - A feature service becomes a feed and a tile service a raster layer whose
 *   legend is the server's, at most five entries.
 *
 * It does not check what it makes: a field list it cannot use, such as one
 * with no text field or no object id, produces a candidate the catalogue
 * skips with the path of each problem, so the rules stay in one place. A
 * layer whose metadata it cannot read at all, such as one with no `credit`,
 * becomes a value the catalogue skips with `definition: must be an object`,
 * so one malformed layer costs one layer.
 *
 * @remarks The input is typed {@link ServerLayerList}. A host that receives
 *   raw JSON should check that it is an object with a `layers` array before
 *   it calls this: only the layers inside the list are read defensively.
 */
export function mapServerLayers(
  server: ServerLayerList,
): readonly (LayerCandidate | null)[] {
  return server.layers.map(mapLayer);
}
