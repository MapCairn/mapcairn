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
  /**
   * The credit. `{year}` stands for the current year, for a provider whose
   * notice asks for it, so the credit is never out of date.
   */
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

/**
 * A number between two bounds, such as a heatmap's radius. Its value is a
 * decimal string such as `20`. It can fill a URL template like any other
 * control, or tune how a layer is drawn, which costs no data.
 */
export interface RangeControlDefinition extends ControlBase {
  readonly kind: "range";
  readonly min: number;
  readonly max: number;
  /** The smallest change the slider makes. Positive. */
  readonly step: number;
  readonly default: number;
  /** Appended to the shown value, such as ` px`. */
  readonly unit?: string;
}

/** Every kind of control a layer can offer. */
export type LayerControlDefinition =
  | SegmentedControlDefinition
  | SwitchControlDefinition
  | DateControlDefinition
  | OpacityControlDefinition
  | RangeControlDefinition;

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

/**
 * A feed that is asked only for the features inside the current view, for a
 * dataset too large to fetch whole. The layer requests again, after the map
 * has settled, each time the view leaves the area last loaded.
 *
 * @remarks `url` must use `{west}`, `{south}`, `{east}` and `{north}` (a box
 *   in decimal degrees) and may use `{limit}`, which is `maxFeatures` plus
 *   one so the response shows when more exist. Beyond `maxFeatures` the layer
 *   draws the first ones and says to zoom in.
 */
export interface QuerySource {
  readonly kind: "query";
  readonly url: string;
  readonly decoder: string;
  readonly fields: FieldMap;
  readonly filter?: FeatureFilter;
  /** The most features drawn at once, 1 to 5000. */
  readonly maxFeatures: number;
  /** Nothing is requested below this normalised zoom; the layer says to zoom in. */
  readonly minzoom?: number;
}

/**
 * Vector tiles drawn by the map engine, styled per source layer. Features
 * stay in the tiles, so a layer of this kind has a key but no cards or list.
 */
export interface VectorTileSource {
  readonly kind: "vector-tiles";
  /** A URL template over control values. `{z}`, `{x}` and `{y}` are left for the engine. */
  readonly tiles: string;
  /** The shallowest tile level the service has. Defaults to 0. */
  readonly minzoom?: number;
  /** The deepest tile level the service has; the engine scales beyond it. */
  readonly maxzoom: number;
}

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

/** How a polygon is hatched, so a fill's meaning never rests on colour alone. */
export type FillPattern = "solid" | "stripes" | "dots" | "crosshatch";

/** How a line or outline is dashed. */
export type LineDash = "solid" | "dashed" | "dotted";

/**
 * Marks a class can carry beside its colour. Each is a second signal that
 * survives colour blindness and a greyscale print.
 */
export interface ShapeMarks {
  /** Hatching drawn over a polygon's fill. Defaults to `solid` (none). */
  readonly pattern?: FillPattern;
  /** Dashing of a line, or of a polygon's outline. Defaults to the style's `dash`. */
  readonly dash?: LineDash;
  /** Line or outline width in pixels, 0.5 to 12. Defaults to the style's `width`. */
  readonly width?: number;
}

/** One category of a polygon or line style. */
export interface ShapeCategory extends ShapeMarks {
  readonly value: string | number;
  readonly label: string;
  readonly colour: PaletteSlot;
}

/** One value range of a polygon or line style, from explicit stops. */
export interface ShapeStep extends ShapeMarks {
  readonly min: number;
  readonly label: string;
  readonly colour: PaletteSlot;
}

/** One colour for every polygon or line. */
export interface ShapeFixedColour extends ShapeMarks {
  readonly kind: "fixed";
  readonly colour: PaletteSlot;
  readonly label: string;
}

/** Colour by category: a field's value picks the class. */
export interface ShapeCategoryColour {
  readonly kind: "category";
  readonly field: string;
  readonly categories: readonly ShapeCategory[];
  /** Used for a value no category names. */
  readonly other: ShapeMarks & {
    readonly label: string;
    readonly colour: PaletteSlot;
  };
}

/** Graduated colour from explicit stops (class breaks). */
export interface ShapeStepColour {
  readonly kind: "steps";
  readonly field: string;
  /** Ascending minimums; the first applies to everything below the second. */
  readonly steps: readonly ShapeStep[];
}

/**
 * Graduated colour in equal intervals over a numeric field. The classes are
 * worked out from `min`, `max` and the ramp's length, so a legend never
 * disagrees with the map: values below `min` fall in the first class and
 * values above `max` in the last.
 */
export interface ShapeIntervalColour {
  readonly kind: "intervals";
  readonly field: string;
  readonly min: number;
  readonly max: number;
  /** One ordered palette colour per class, lowest first. Two to seven classes. */
  readonly ramp: readonly PaletteSlot[];
  /** Appended to the legend's numbers, such as ` people`. */
  readonly unit?: string;
  /** Optional marks, one per class (lowest first), so each class has a second signal. */
  readonly patterns?: readonly FillPattern[];
  readonly dashes?: readonly LineDash[];
  readonly widths?: readonly number[];
}

/** How a polygon or line layer is coloured. */
export type ShapeColour =
  | ShapeFixedColour
  | ShapeCategoryColour
  | ShapeStepColour
  | ShapeIntervalColour;

/** Text drawn on each polygon or line, filled from the feature's fields. */
export interface ShapeLabel {
  /** A template such as `{name}` or `{name}: {population|number}`. */
  readonly template: string;
  /** Labels appear from this normalised zoom, so a world view is not buried in text. */
  readonly minzoom?: number;
}

/**
 * How a feed's polygons or lines are drawn: a fill (or a stroke, for lines)
 * coloured by a rule, with outline width, hatching, dashing and labels. The
 * legend is derived from it.
 *
 * @remarks A style draws one geometry kind, so its legend and widths are
 *   unambiguous: `area` draws polygons and multipolygons, `line` draws lines
 *   and multilines. Features of the other kind are not drawn. A polygon's
 *   outline is the palette's ink, so the shape reads on any fill.
 */
export interface ShapeStyle {
  readonly kind: "shapes";
  readonly geometry: "area" | "line";
  readonly colour: ShapeColour;
  /** Fill opacity of polygons, 0.1 to 1. Defaults to 0.55. */
  readonly fillOpacity?: number;
  /**
   * Stroke width in pixels, 0.5 to 12: a polygon's outline (default 1.5) or a
   * line (default 2.5). A class's own `width` wins.
   */
  readonly width?: number;
  /** Dashing of the outline or line. Defaults to `solid`. A class's own `dash` wins. */
  readonly dash?: LineDash;
  readonly label?: ShapeLabel;
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

/**
 * A layer of features from a feed: points with a point style (no `kind`),
 * or polygons or lines with a `shapes` style. Name the style type to narrow
 * it, such as `FeedLayerDefinition<PointStyle>`.
 */
export interface FeedLayerDefinition<
  S extends PointStyle | ShapeStyle = PointStyle | ShapeStyle,
> extends LayerDefinitionBase {
  readonly source: FeedSource | QuerySource;
  readonly style: S;
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

/**
 * A number a heatmap reads: fixed in the definition, or taken from one of the
 * layer's `range` controls so the person can tune it.
 */
export type HeatmapValue = number | { readonly control: string };

/**
 * How a heatmap is drawn. The legend names each step of the ramp with a word
 * for how dense the points are, so density never rests on colour alone.
 */
export interface HeatmapSpec {
  /** The field that weights each point (a decoded field, or a tile property). Each counts 1 without it. */
  readonly weightField?: string;
  /** Pixels each point spreads over, 4 to 80. */
  readonly radius: HeatmapValue;
  /** Multiplies each point's weight, 0.1 to 5. */
  readonly intensity: HeatmapValue;
  /** Ordinal colours from the lowest density to the highest. Three to five. */
  readonly ramp: readonly PaletteSlot[];
  /** One word for each step of the ramp, such as `Sparse`, `Moderate`, `Dense`. */
  readonly words: readonly string[];
}

/**
 * Point density from a feed or a query, drawn as a heatmap. It has no cards
 * or list: the status says how many points are drawn and the legend says what
 * the colours mean.
 */
export interface HeatmapLayerDefinition extends LayerDefinitionBase {
  readonly source: FeedSource | QuerySource;
  readonly heatmap: HeatmapSpec;
  /** Shown when the feed has no points. */
  readonly emptyText: string;
}

/** One layer of a vector tile source, drawn as polygons or lines. */
export interface VectorShapeLayer {
  /** The layer's name inside the tiles. */
  readonly sourceLayer: string;
  /**
   * How it is drawn. The colour rule's `field` is a tile property, and a
   * label template may name only a single property, such as `{name}`.
   */
  readonly style: ShapeStyle;
  /** Visible from and to these normalised zoom levels. */
  readonly minzoom?: number;
  readonly maxzoom?: number;
}

/** One layer of a vector tile source whose points are drawn as a heatmap. */
export interface VectorHeatmapLayer {
  readonly sourceLayer: string;
  readonly heatmap: HeatmapSpec;
  readonly minzoom?: number;
  readonly maxzoom?: number;
}

/** Either way a vector tile source layer can be drawn. */
export type VectorSourceLayer = VectorShapeLayer | VectorHeatmapLayer;

/**
 * A vector tile layer: one source, drawn from one or more of its source
 * layers, each with its own style and zoom window. The window of the whole
 * layer is the widest any source layer needs.
 */
export interface VectorTileLayerDefinition extends LayerDefinitionBase {
  readonly source: VectorTileSource;
  readonly sourceLayers: readonly VectorSourceLayer[];
  /** The layer is visible from and to these normalised zoom levels. */
  readonly minzoom?: number;
  readonly maxzoom?: number;
}

/** One open data layer, as data. */
export type LayerDefinition =
  | FeedLayerDefinition
  | HeatmapLayerDefinition
  | TileLayerDefinition
  | VectorTileLayerDefinition;

/**
 * Whether a definition is a layer of features with cards and a list: points,
 * polygons or lines from a feed or a query.
 */
export function isFeedLayer(
  definition: LayerDefinition,
): definition is FeedLayerDefinition {
  return "card" in definition;
}

/** Whether a definition loads features from a feed or a query (points, shapes or a heatmap). */
export function loadsFeatures(
  definition: LayerDefinition,
): definition is FeedLayerDefinition | HeatmapLayerDefinition {
  return "card" in definition || "heatmap" in definition;
}

/** Whether a definition is a heatmap of a feed or a query. */
export function isHeatmapLayer(
  definition: LayerDefinition,
): definition is HeatmapLayerDefinition {
  return "heatmap" in definition;
}

/** Whether a definition is a vector tile layer. */
export function isVectorTileLayer(
  definition: LayerDefinition,
): definition is VectorTileLayerDefinition {
  return "sourceLayers" in definition;
}

/** A layer whose features come from a query for the current view. */
export type QueryLayerDefinition = (
  | FeedLayerDefinition
  | HeatmapLayerDefinition
) & { readonly source: QuerySource };

/** Whether a definition requests only the features in view. */
export function isQueryLayer(
  definition: LayerDefinition,
): definition is QueryLayerDefinition {
  return loadsFeatures(definition) && definition.source.kind === "query";
}

/** Whether a feed layer's style draws polygons and lines rather than points. */
export function isShapeStyle(
  style: PointStyle | ShapeStyle,
): style is ShapeStyle {
  return "kind" in style && style.kind === "shapes";
}
