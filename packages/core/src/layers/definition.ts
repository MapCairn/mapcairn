/**
 * The layer definition: typed data that describes one open data layer
 * completely, so adding a layer is a new definition and not new code. Nothing
 * in the SDK branches on a layer id, a provider or a response shape; it reads
 * these fields.
 *
 * Strings in braces (`{window}`, `{time|relative}`) are templates. URL
 * templates are filled from control values and derived variables; card and
 * list templates are filled from a feature's decoded fields, optionally
 * through a named formatter.
 */

/** A credit line a provider asks for. */
export interface LayerAttribution {
  readonly text: string;
  /** An `https` link to the provider or its terms. */
  readonly url?: string;
}

/** One option of a segmented control. */
export interface SegmentedOption {
  /** The value used in templates and the permalink: lowercase letters, digits, `.`, `_` and `-`. */
  readonly value: string;
  readonly label: string;
}

/**
 * A date relative to today in UTC, so a definition never hard-codes a day
 * that goes stale. `{ daysAgo: 1 }` is yesterday.
 */
export interface RelativeDate {
  readonly daysAgo: number;
}

/** A calendar date: an ISO `YYYY-MM-DD` string, or a day relative to today (UTC). */
export type DateBound = string | RelativeDate;

/**
 * Makes a control usable only while another control has one of some values,
 * such as "Include smaller earthquakes" only for the hour and the day. A
 * disabled control keeps its value but shows as unavailable.
 */
export interface ControlCondition {
  readonly control: string;
  readonly in: readonly string[];
}

interface ControlBase {
  /** Unique inside the layer. Lowercase letters, digits and hyphens, starting with a letter. */
  readonly id: string;
  readonly label: string;
  /** Optional one-line help under the control. */
  readonly description?: string;
  readonly enabledWhen?: ControlCondition;
}

/** A choice of a few values, drawn as a segmented control. */
export interface SegmentedControlDefinition extends ControlBase {
  readonly kind: "segmented";
  readonly options: readonly SegmentedOption[];
  readonly default: string;
}

/** An on and off choice. Its value is the string `true` or `false`. */
export interface SwitchControlDefinition extends ControlBase {
  readonly kind: "switch";
  readonly default: boolean;
}

/** A calendar day, bounded on both sides. Its value is `YYYY-MM-DD`. */
export interface DateControlDefinition extends ControlBase {
  readonly kind: "date";
  readonly min: DateBound;
  readonly max: DateBound;
  readonly default: DateBound;
}

/**
 * How opaque a tile overlay is, from 0.1 to 1. Its value is a decimal string
 * such as `0.8`. It never changes a URL, so it costs no data.
 */
export interface OpacityControlDefinition extends ControlBase {
  readonly kind: "opacity";
  readonly default: number;
}

/** Every kind of control a layer can offer. */
export type LayerControlDefinition =
  | SegmentedControlDefinition
  | SwitchControlDefinition
  | DateControlDefinition
  | OpacityControlDefinition;

/**
 * A URL variable computed from control values with a lookup table, for feeds
 * whose file names combine several choices. The key is the values of `from`,
 * in order, joined with `|`, such as `day|false`.
 */
export interface DerivedVariable {
  /** The variable name used in templates. */
  readonly id: string;
  readonly from: readonly string[];
  readonly table: Readonly<Record<string, string>>;
}

/**
 * Where each decoded field comes from: a field name mapped to a dotted path
 * into a raw feature, such as `properties.mag` or `geometry.coordinates.2`.
 * `id` and `title` are required.
 */
export interface FieldMap {
  readonly id: string;
  readonly title: string;
  readonly [field: string]: string;
}

/** Keeps the features whose decoded `field` equals one of `in`. */
export interface FeatureFilter {
  readonly field: string;
  readonly in: readonly (string | number)[];
}

/** A feed: one JSON document of point features, fetched when the layer is on. */
export interface FeedSource {
  readonly kind: "feed";
  /** A URL template over control values and derived variables. */
  readonly url: string;
  /** The name of a registered decoder, such as `geojson`. */
  readonly decoder: string;
  readonly fields: FieldMap;
  readonly filter?: FeatureFilter;
  /**
   * The least time, in seconds (at most 3600), a response is reused in this
   * page, for providers that send no `Cache-Control` max-age. Layers split
   * from one feed then cost one request. Nothing is stored beyond the page.
   */
  readonly cacheSeconds?: number;
}

/** Raster tiles drawn as an overlay, such as WMTS imagery or a WMS map. */
export interface TileSource {
  readonly kind: "tiles";
  /**
   * A URL template over control values. `{z}`, `{x}`, `{y}` and
   * `{bbox-epsg-3857}` are left for the map engine to fill.
   */
  readonly tiles: string;
  readonly tileSize: 256 | 512;
  /** The deepest tile level the service has; the engine scales beyond it. */
  readonly maxzoom: number;
}

/** Every kind of layer source. */
export type LayerSourceDefinition = FeedSource | TileSource;

/** The shapes a point marker can take, so colour is never the only signal. */
export type MarkerShape = "circle" | "square" | "triangle" | "diamond";

/** A colour from the data palette, by name (see `PALETTE_SLOTS`). */
export type PaletteSlot = string;

/** Marker radius by value: the radius of the last stop at or below the value. */
export interface SizeStops {
  readonly field: string;
  /** Pairs of `[minimum value, radius in pixels]`, ascending. */
  readonly stops: readonly (readonly [number, number])[];
  /** Legend label for each stop, such as `Magnitude 4.5 and above`. */
  readonly labels: readonly string[];
}

/** One category of a categorical style. */
export interface StyleCategory {
  readonly value: string | number;
  readonly label: string;
  readonly colour: PaletteSlot;
  readonly shape?: MarkerShape;
}

/** Colour by category, for alert levels and kinds. */
export interface CategoryColour {
  readonly kind: "category";
  readonly field: string;
  readonly categories: readonly StyleCategory[];
  /** Used for a value no category names. */
  readonly other: { readonly label: string; readonly colour: PaletteSlot };
}

/** Colour by ordered value ranges, using an ordered (ordinal) palette. */
export interface StepColour {
  readonly kind: "steps";
  readonly field: string;
  /** Ascending minimums; the first applies to everything below the second. */
  readonly steps: readonly {
    readonly min: number;
    readonly label: string;
    readonly colour: PaletteSlot;
  }[];
}

/** One colour for every feature. */
export interface FixedColour {
  readonly kind: "fixed";
  readonly colour: PaletteSlot;
  readonly label: string;
}

/** How a feed's points are drawn, and so what its legend says. */
export interface PointStyle {
  readonly colour: CategoryColour | StepColour | FixedColour;
  /** Defaults to a fixed radius of 6 pixels. */
  readonly size?: SizeStops;
  /** The shape when the colour rule names none. Defaults to `circle`. */
  readonly shape?: MarkerShape;
}

/**
 * A second source fetched only when someone asks for it on one feature, such
 * as an event's affected area. Its URL comes from a field of that feature,
 * so it is checked against `origins` before any request is made.
 */
export interface DetailSource {
  /** The decoded field that holds the URL. */
  readonly urlField: string;
  /** The only `https` origins the URL may have. */
  readonly origins: readonly string[];
  readonly decoder: string;
  /** How the polygons and lines are drawn. */
  readonly colour: PaletteSlot;
  /** The button label, such as `Show affected area`. */
  readonly label: string;
  /** Roughly how much one request costs, such as `about 300 KB`. */
  readonly dataCost: string;
}

/** A sort option for the list of loaded features. */
export interface ListSort {
  /** Lowercase letters, digits and hyphens. */
  readonly id: string;
  readonly label: string;
  readonly field: string;
  readonly direction: "asc" | "desc";
}

/** What a feature's card shows. Templates read decoded fields. */
export interface CardSpec {
  readonly title: string;
  /** One line each, such as `{depthKm|km} deep`. Lines whose fields are all missing are left out. */
  readonly lines: readonly string[];
  /** A link to the provider's page for the feature. */
  readonly link?: { readonly field: string; readonly label: string };
}

/** What each row of the list of loaded features shows. */
export interface ListSpec {
  /** The row's second line. The first line is the card title. */
  readonly secondary: string;
  /** The first is the default. */
  readonly sorts: readonly ListSort[];
}

interface LayerDefinitionBase {
  /** Lowercase letters, digits and hyphens, starting with a letter. Used in the permalink. */
  readonly id: string;
  readonly name: string;
  /** One sentence on what the layer shows. */
  readonly description: string;
  /** A heading the layer is listed under, such as `Hazards`. */
  readonly group: string;
  /** Roughly how much data turning the layer on costs, such as `about 30 KB`. */
  readonly dataCost: string;
  readonly attribution: readonly LayerAttribution[];
  /** Shown on every card, for example that alerts are automatic estimates. */
  readonly disclaimer?: string;
  readonly controls: readonly LayerControlDefinition[];
  readonly variables?: readonly DerivedVariable[];
}

/** A layer of point features from a feed. */
export interface FeedLayerDefinition extends LayerDefinitionBase {
  readonly source: FeedSource;
  readonly style: PointStyle;
  readonly card: CardSpec;
  readonly list: ListSpec;
  readonly detail?: DetailSource;
  /** Shown when the feed has no features, such as `No volcano alerts right now`. */
  readonly emptyText: string;
}

/** A raster overlay. It has no features, card or list. */
export interface TileLayerDefinition extends LayerDefinitionBase {
  readonly source: TileSource;
  /** What the colours on the overlay mean, if anything. */
  readonly legend?: readonly {
    readonly label: string;
    readonly colour: PaletteSlot;
  }[];
}

/** One open data layer, as data. */
export type LayerDefinition = FeedLayerDefinition | TileLayerDefinition;

/** Whether a definition is a feed layer. */
export function isFeedLayer(
  definition: LayerDefinition,
): definition is FeedLayerDefinition {
  return definition.source.kind === "feed";
}
