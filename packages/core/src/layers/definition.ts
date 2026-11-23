// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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
 *
 * Fields a person reads (names, descriptions, labels, costs, disclaimers and
 * empty text) are a `DefinitionText`: a `MessageKey` the active catalogue
 * translates, or a plain string shown as written. Card, list and feed-shape
 * label templates can use a host-defined key; their `{field}` placeholders
 * remain the definition's own. Credits are legal text and are never translated.
 */
import type { DefinitionText } from "../ports/messages";
import type { LayerTemplate } from "./template";

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
  /** The option's name. */
  readonly label: DefinitionText;
}

/**
 * A date relative to today in UTC, so a definition never hard-codes a day
 * that goes stale. `{ daysAgo: 1 }` is yesterday.
 */
export interface RelativeDate {
  /** How many days before today. Zero is today. */
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
  /** The id of the control to watch, in the same layer. */
  readonly control: string;
  /** The values of that control that enable this one. */
  readonly in: readonly string[];
}

/** The fields every layer control has, whatever its kind. */
export interface ControlBase {
  /** Unique inside the layer. Lowercase letters, digits and hyphens, starting with a letter. */
  readonly id: string;
  /** The control's name, shown beside it. */
  readonly label: DefinitionText;
  /** Optional one-line help under the control. */
  readonly description?: DefinitionText;
  /** Makes the control usable only while another control has one of some values. */
  readonly enabledWhen?: ControlCondition;
}

/** A choice of a few values, drawn as a segmented control. */
export interface SegmentedControlDefinition extends ControlBase {
  /** Tells a segmented control from the other kinds. */
  readonly kind: "segmented";
  /** The choices, in the order they are drawn. */
  readonly options: readonly SegmentedOption[];
  /** The value of the option chosen until the person picks another. */
  readonly default: string;
}

/** An on and off choice. Its value is the string `true` or `false`. */
export interface SwitchControlDefinition extends ControlBase {
  /** Tells a switch from the other control kinds. */
  readonly kind: "switch";
  /** Whether it starts on. */
  readonly default: boolean;
}

/** A calendar day, bounded on both sides. Its value is `YYYY-MM-DD`. */
export interface DateControlDefinition extends ControlBase {
  /** Tells a date control from the other kinds. */
  readonly kind: "date";
  /** The earliest day that can be chosen. */
  readonly min: DateBound;
  /** The latest day that can be chosen. */
  readonly max: DateBound;
  /** The day chosen until the person picks another. */
  readonly default: DateBound;
}

/**
 * A time relative to now, so a definition can follow a provider's latency:
 * `{ minutesAgo: 360 }` is six hours ago, rounded down to the control's step.
 */
export interface RelativeTime {
  /** How many minutes before now. Zero is now. */
  readonly minutesAgo: number;
}

/**
 * A slot of a date and time control: a UTC `YYYY-MM-DDtHHMM` string on the
 * control's step, such as `2000-06-01t0000`, or a time relative to now.
 */
export type DateTimeBound = string | RelativeTime;

/**
 * A UTC date and a time of day on a fixed step, such as the half hours of a
 * product the provider names by timestamp. Its value is the slot's start as
 * `YYYY-MM-DDtHHMM` (lowercase `t`, so it fits a permalink); a URL template
 * receives it as an ISO instant, `YYYY-MM-DDTHH:MM:SSZ`. Only slots between
 * `min` and `max` are offered, so `max` set to the provider's latency keeps
 * slots that are not out yet off the list.
 */
export interface DateTimeControlDefinition extends ControlBase {
  /** Tells a date and time control from the other kinds. */
  readonly kind: "datetime";
  /** Minutes between slots. A whole number that divides a day, such as 30. */
  readonly stepMinutes: number;
  /** The earliest moment that can be chosen. */
  readonly min: DateTimeBound;
  /** The latest moment that can be chosen. */
  readonly max: DateTimeBound;
  /** The moment chosen until the person picks another. */
  readonly default: DateTimeBound;
}

/**
 * How opaque a tile overlay is, from 0.1 to 1. Its value is a decimal string
 * such as `0.8`. It never changes a URL, so it costs no data.
 */
export interface OpacityControlDefinition extends ControlBase {
  /** Tells an opacity control from the other kinds. */
  readonly kind: "opacity";
  /** The opacity used until the person changes it, 0.1 to 1. */
  readonly default: number;
}

/**
 * A number between two bounds, such as a heatmap's radius. Its value is a
 * decimal string such as `20`. It can fill a URL template like any other
 * control, or tune how a layer is drawn, which costs no data.
 */
export interface RangeControlDefinition extends ControlBase {
  /** Tells a range control from the other kinds. */
  readonly kind: "range";
  /** The lowest value the slider allows. */
  readonly min: number;
  /** The highest value the slider allows. */
  readonly max: number;
  /** The smallest change the slider makes. Positive. */
  readonly step: number;
  /** The value used until the person changes it. */
  readonly default: number;
  /** Appended to the shown value, such as ` px`. */
  readonly unit?: LayerTemplate;
}

/** Every kind of control a layer can offer. */
export type LayerControlDefinition =
  | SegmentedControlDefinition
  | SwitchControlDefinition
  | DateControlDefinition
  | DateTimeControlDefinition
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
  /** The ids of the controls whose values are joined, in order, to make the lookup key. */
  readonly from: readonly string[];
  /** Maps each joined key, such as `day|false`, to the value the variable takes. */
  readonly table: Readonly<Record<string, string>>;
}

/**
 * Where each decoded field comes from: a field name mapped to a dotted path
 * into a raw feature, such as `properties.mag` or `geometry.coordinates.2`.
 * `id` and `title` are required.
 */
export interface FieldMap {
  /** The path to a value that identifies the feature, unique in the feed. */
  readonly id: string;
  /** The path to the value used as the feature's name. */
  readonly title: string;
  /** Any further decoded field a template or style reads, by name, with its path. */
  readonly [field: string]: string;
}

/** Keeps the features whose decoded `field` equals one of `in`. */
export interface FeatureFilter {
  /** The decoded field to test. */
  readonly field: string;
  /** The values that keep a feature. A feature whose field equals none of them is dropped. */
  readonly in: readonly (string | number)[];
}

/** A feed: one JSON document of point features, fetched when the layer is on. */
export interface FeedSource {
  /** Tells a feed from a query source. */
  readonly kind: "feed";
  /** A URL template over control values and derived variables. */
  readonly url: string;
  /** The name of a registered decoder, such as `geojson`. */
  readonly decoder: string;
  /** Where each decoded field is read from in a raw feature. */
  readonly fields: FieldMap;
  /** Drops features that do not match, before they are drawn or listed. */
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
  /** Tells a raster tile source from the other source kinds. */
  readonly kind: "tiles";
  /**
   * A URL template over control values. `{z}`, `{x}`, `{y}` and
   * `{bbox-epsg-3857}` are left for the map engine to fill.
   */
  readonly tiles: string;
  /** The tiles' size in pixels, 256 or 512. */
  readonly tileSize: 256 | 512;
  /** The deepest tile level the service has; the engine scales beyond it. */
  readonly maxzoom: number;
  /**
   * The box the service has real tiles for, as `[west, south, east, north]`
   * in degrees, west less than east. The engine asks for no tile that lies
   * wholly outside it; a tile that straddles an edge is still drawn whole.
   * Set it when a provider fills the rest with blank or opaque filler: on a
   * globe the engine stretches a tile at the edge of the world over the pole,
   * so filler there becomes wedges meeting at the pole.
   */
  readonly bounds?: readonly [number, number, number, number];
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
  /** Tells a query from a feed. */
  readonly kind: "query";
  /** A URL template over the view's box and the control values. */
  readonly url: string;
  /** The name of the registered decoder that reads the response. */
  readonly decoder: string;
  /** Where each decoded field is read from in a raw feature. */
  readonly fields: FieldMap;
  /** Drops features that do not match, before they are drawn or listed. */
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
  /** Tells a vector tile source from the other source kinds. */
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
  /** The numeric field the radius is read from. */
  readonly field: string;
  /** Pairs of `[minimum value, radius in pixels]`, ascending. */
  readonly stops: readonly (readonly [number, number])[];
  /** Legend label for each stop, such as `Magnitude 4.5 and above`. */
  readonly labels: readonly DefinitionText[];
}

/** One category of a categorical style. */
export interface StyleCategory {
  /** The field value this category matches. */
  readonly value: string | number;
  /** The legend's entry. */
  readonly label: DefinitionText;
  /** The palette slot the matching points are drawn in. */
  readonly colour: PaletteSlot;
  /** The marker shape for this category, overriding the style's. */
  readonly shape?: MarkerShape;
}

/** Colour by category, for alert levels and kinds. */
export interface CategoryColour {
  /** Tells a category colour rule from the other rules. */
  readonly kind: "category";
  /** The decoded field whose value picks the category. */
  readonly field: string;
  /** The categories, each with a value, a label and a colour. */
  readonly categories: readonly StyleCategory[];
  /** Used for a value no category names. */
  readonly other: {
    readonly label: DefinitionText;
    readonly colour: PaletteSlot;
  };
}

/** Colour by ordered value ranges, using an ordered (ordinal) palette. */
export interface StepColour {
  /** Tells a stepped rule from the other colour rules. */
  readonly kind: "steps";
  /** The numeric field the steps are read from. */
  readonly field: string;
  /** Ascending minimums; the first applies to everything below the second. */
  readonly steps: readonly {
    readonly min: number;
    readonly label: DefinitionText;
    readonly colour: PaletteSlot;
  }[];
}

/** One colour for every feature. */
export interface FixedColour {
  /** Tells a fixed colour from the other rules. */
  readonly kind: "fixed";
  /** The palette slot every feature is drawn in. */
  readonly colour: PaletteSlot;
  /** The legend's entry for that colour. */
  readonly label: DefinitionText;
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
  /** The field value this category matches. */
  readonly value: string | number;
  /** The legend's entry. */
  readonly label: DefinitionText;
  /** The palette slot the matching features are drawn in. */
  readonly colour: PaletteSlot;
}

/** One value range of a polygon or line style, from explicit stops. */
export interface ShapeStep extends ShapeMarks {
  /** The lowest value this class holds. */
  readonly min: number;
  /** The legend's entry. */
  readonly label: DefinitionText;
  /** The palette slot the class is drawn in. */
  readonly colour: PaletteSlot;
}

/** One colour for every polygon or line. */
export interface ShapeFixedColour extends ShapeMarks {
  /** Tells a fixed colour from the other shape colour rules. */
  readonly kind: "fixed";
  /** The palette slot every shape is drawn in. */
  readonly colour: PaletteSlot;
  /** The legend's entry for that colour. */
  readonly label: DefinitionText;
}

/** Colour by category: a field's value picks the class. */
export interface ShapeCategoryColour {
  /** Tells a category rule from the other shape colour rules. */
  readonly kind: "category";
  /** The tile property or decoded field whose value picks the category. */
  readonly field: string;
  /** The categories, each with a value, a label and a colour. */
  readonly categories: readonly ShapeCategory[];
  /** Used for a value no category names. */
  readonly other: ShapeMarks & {
    readonly label: DefinitionText;
    readonly colour: PaletteSlot;
  };
}

/** Graduated colour from explicit stops (class breaks). */
export interface ShapeStepColour {
  /** Tells a stepped rule from the other shape colour rules. */
  readonly kind: "steps";
  /** The numeric field the steps are read from. */
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
  /** Tells an equal-interval rule from the other shape colour rules. */
  readonly kind: "intervals";
  /** The numeric field the classes are made from. */
  readonly field: string;
  /** The lower end of the range the classes divide. Values below it fall in the first class. */
  readonly min: number;
  /** The upper end of the range the classes divide. Values above it fall in the last class. */
  readonly max: number;
  /** One ordered palette colour per class, lowest first. Two to seven classes. */
  readonly ramp: readonly PaletteSlot[];
  /** Appended to the legend's numbers, such as ` people`. */
  readonly unit?: LayerTemplate;
  /** Optional marks, one per class (lowest first), so each class has a second signal. */
  readonly patterns?: readonly FillPattern[];
  /** Optional dashing, one per class, lowest first. */
  readonly dashes?: readonly LineDash[];
  /** Optional stroke widths in pixels, one per class, lowest first. */
  readonly widths?: readonly number[];
}

/** How a polygon or line layer is coloured. */
export type ShapeColour =
  | ShapeFixedColour
  | ShapeCategoryColour
  | ShapeStepColour
  | ShapeIntervalColour;

/** Text drawn on each polygon or line, filled from the feature's fields. */
export interface ShapeLabel<T extends LayerTemplate = string> {
  /** A template such as `{name}` or `{name}: {population|number}`. */
  readonly template: T;
  /** Labels appear from this normalised zoom, so a world view is not buried in text. */
  readonly minzoom?: number;
}

/**
 * How polygons or lines are drawn: a fill (or a stroke, for lines) coloured
 * by a rule, with outline width, hatching, dashing and labels. Its default
 * label type remains a plain string; feed definitions that use keyed labels
 * use {@link FeedShapeStyle}. The legend is derived from it.
 *
 * @remarks A style draws one geometry kind, so its legend and widths are
 *   unambiguous: `area` draws polygons and multipolygons, `line` draws lines
 *   and multilines. Features of the other kind are not drawn. A polygon's
 *   outline is the palette's ink, so the shape reads on any fill.
 */
export interface ShapeStyle<T extends LayerTemplate = string> {
  /** Always `shapes`; tells a shape style from a point style. */
  readonly kind: "shapes";
  /** Whether the style draws polygons (`area`) or lines (`line`). */
  readonly geometry: "area" | "line";
  /** The rule that picks each shape's colour. */
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
  /** A template for the text drawn on each shape, over the decoded fields or tile properties. */
  readonly label?: ShapeLabel<T>;
}

/** A feed shape style whose label may use a host-keyed template. */
export type FeedShapeStyle = ShapeStyle<LayerTemplate>;

/** How a feed's points are drawn, and so what its legend says. */
export interface PointStyle {
  /** The rule that picks each point's colour. */
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
  /** The name of the registered decoder that reads the detail response. */
  readonly decoder: string;
  /** How the polygons and lines are drawn. */
  readonly colour: PaletteSlot;
  /** The button label, such as `Show affected area`. */
  readonly label: DefinitionText;
  /** Roughly how much one request costs, such as `about 300 KB`. */
  readonly dataCost: DefinitionText;
}

/** A sort option for the list of loaded features. */
export interface ListSort {
  /** Lowercase letters, digits and hyphens. */
  readonly id: string;
  /** The option's name. */
  readonly label: DefinitionText;
  /** The decoded field the list is ordered by. */
  readonly field: string;
  /** `asc` lists the lowest first and `desc` the highest. */
  readonly direction: "asc" | "desc";
}

/** What a feature's card shows. Templates read decoded fields. */
export interface CardSpec {
  /** The card's heading, a template over the feature's decoded fields. */
  readonly title: LayerTemplate;
  /** One line each, such as `{depthKm|km} deep`. Lines whose fields are all missing are left out. */
  readonly lines: readonly LayerTemplate[];
  /** A link to the provider's page for the feature. */
  readonly link?: {
    readonly field: string;
    readonly label: DefinitionText;
  };
}

/** What each row of the list of loaded features shows. */
export interface ListSpec {
  /** The row's second line. The first line is the card title. */
  readonly secondary: LayerTemplate;
  /** The first is the default. */
  readonly sorts: readonly ListSort[];
}

/** The fields every layer definition has, whatever its kind. */
export interface LayerDefinitionBase {
  /** Lowercase letters, digits and hyphens, starting with a letter. Used in the permalink. */
  readonly id: string;
  /** The layer's name in the list and the key. */
  readonly name: DefinitionText;
  /** One sentence on what the layer shows. */
  readonly description: DefinitionText;
  /** A heading the layer is listed under, such as `Hazards`. */
  readonly group: DefinitionText;
  /** The credits that are shown while the layer is on. */
  readonly attribution: readonly LayerAttribution[];
  /** Shown on every card, for example that alerts are automatic estimates. */
  readonly disclaimer?: DefinitionText;
  /** What the person can adjust, such as a date or a time window. */
  readonly controls: readonly LayerControlDefinition[];
  /** URL variables computed from control values. */
  readonly variables?: readonly DerivedVariable[];
}

/**
 * A layer of features from a feed: points with a point style (no `kind`),
 * or polygons or lines with a `shapes` style. Name the style type to narrow
 * it, such as `FeedLayerDefinition<PointStyle>`.
 */
export interface FeedLayerDefinition<
  S extends PointStyle | FeedShapeStyle = PointStyle | FeedShapeStyle,
> extends LayerDefinitionBase {
  /** Where the features come from: a whole feed or a query over the view. */
  readonly source: FeedSource | QuerySource;
  /** How the features are drawn, and so what the legend says. */
  readonly style: S;
  /** What a feature's card shows. */
  readonly card: CardSpec;
  /** How the loaded features are listed. */
  readonly list: ListSpec;
  /** A second source fetched on request for one feature, such as its affected area. */
  readonly detail?: DetailSource;
  /** Shown when the feed has no features, such as `No volcano alerts right now`. */
  readonly emptyText: DefinitionText;
}

/**
 * Asks a service what a raster tile layer shows at a tapped place, as a WMS
 * `GetFeatureInfo` request does. The answer is decoded into features that
 * open the same card as any feature. Nothing is asked until a tap.
 *
 * @remarks The URL is a template over the layer's controls and these
 *   variables, all filled by `identifyUrl`: `{lng}` and `{lat}` (the tap, in
 *   degrees), `{bbox}` (a box around the tap as `minx,miny,maxx,maxy` in
 *   EPSG:3857 metres), `{width}` and `{height}` (the box's size in pixels,
 *   `2 * tolerance + 1`), `{x}` and `{y}` (the tapped pixel in that picture,
 *   which is `tolerance`) and `{zoom}` (the normalised zoom). It needs
 *   `{lng}` and `{lat}`, or all of `{bbox}`, `{width}`, `{height}`, `{x}` and
 *   `{y}`. The origin is fixed in the template, so no placeholder may stand in
 *   the scheme, host or port. The answer must be JSON: GeoJSON, or with
 *   `records` a list at a path. XML, GML, HTML, plain text and JSONP are not
 *   read, and a `POST` is not supported. Coordinates in a GeoJSON answer
 *   must be WGS 84 degrees: the decoder drops a position with a longitude
 *   beyond 180 or a latitude beyond 90, so a server that answers in its own
 *   coordinate system reads as nothing found. A feature with no `id`, or a
 *   null or empty one, takes its position in the answer, which is not stable
 *   from one tap to the next; map `fields.id` to a real attribute when the
 *   service has one.
 */
export interface IdentifySource {
  /** An `https` URL template, filled by `identifyUrl`. */
  readonly url: string;
  /**
   * How far from the tap, in CSS pixels, a feature may be and still be
   * found: a whole number from 1 to 20. Defaults to
   * `DEFAULT_IDENTIFY_TOLERANCE_PX`.
   */
  readonly tolerance?: number;
  /** The name of a registered decoder, such as `geojson`. */
  readonly decoder: string;
  /**
   * A dotted path to a list in a plain JSON answer. Each item of the list
   * becomes the `properties` of one feature at the tapped place, so fields
   * read `properties.name`. A path that does not lead to a list finds nothing.
   * The answer is then handed to `decoder` as a GeoJSON feature collection.
   */
  readonly records?: string;
  /** Where each decoded field comes from. `id` and `title` are required. */
  readonly fields: FieldMap;
  /** What a found feature's card shows. */
  readonly card: CardSpec;
}

/**
 * A raster overlay. It loads no features and has no list. Without an
 * `identify` block it has no card either; with one, a tap on it asks a
 * service for features, which open a card (the block's `card`).
 */
export interface TileLayerDefinition extends LayerDefinitionBase {
  /** Where the raster tiles come from. */
  readonly source: TileSource;
  /** What the colours on the overlay mean, if anything. */
  readonly legend?: readonly {
    readonly label: DefinitionText;
    readonly colour: PaletteSlot;
  }[];
  /**
   * How a tap on the layer finds features. Its card is nested here, not on
   * the layer, so `isFeedLayer` and `loadsFeatures` still treat the layer
   * as one that loads nothing.
   */
  readonly identify?: IdentifySource;
}

/** A raster tile layer that answers a tap. */
export interface IdentifiableLayerDefinition extends TileLayerDefinition {
  /** How a tap on the layer finds features. */
  readonly identify: IdentifySource;
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
  readonly words: readonly DefinitionText[];
}

/**
 * Point density from a feed or a query, drawn as a heatmap. It has no cards
 * or list: the status says how many points are drawn and the legend says what
 * the colours mean.
 */
export interface HeatmapLayerDefinition extends LayerDefinitionBase {
  /** Where the points come from: a whole feed or a query over the view. */
  readonly source: FeedSource | QuerySource;
  /** How the density is drawn. */
  readonly heatmap: HeatmapSpec;
  /** Shown when the feed has no points. */
  readonly emptyText: DefinitionText;
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
  /** The normalised zoom from which the layer is hidden. */
  readonly maxzoom?: number;
}

/** One layer of a vector tile source whose points are drawn as a heatmap. */
export interface VectorHeatmapLayer {
  /** The layer's name inside the tiles. */
  readonly sourceLayer: string;
  /** How the density is drawn. */
  readonly heatmap: HeatmapSpec;
  /** The lowest normalised zoom at which the layer is drawn. */
  readonly minzoom?: number;
  /** The normalised zoom from which the layer is hidden. */
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
  /** Where the vector tiles come from. */
  readonly source: VectorTileSource;
  /** The layers of the tiles that are drawn, each with its own style and zoom window. */
  readonly sourceLayers: readonly VectorSourceLayer[];
  /** The layer is visible from `minzoom` up to, but not including, `maxzoom` (normalised zoom levels), as the engine hides a layer from its `maxzoom`. */
  readonly minzoom?: number;
  /** The normalised zoom from which the layer is hidden. */
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

/** Whether a definition is a raster tile layer: an overlay that loads no features and has no list, and has a card only through an `identify` block. */
export function isRasterTileLayer(
  definition: LayerDefinition,
): definition is TileLayerDefinition {
  return definition.source.kind === "tiles";
}

/** Whether a definition is a raster tile layer that answers a tap, with an `identify` block. */
export function isIdentifiable(
  definition: LayerDefinition,
): definition is IdentifiableLayerDefinition {
  return isRasterTileLayer(definition) && definition.identify !== undefined;
}

/** Whether a layer's features open a card: a feed layer, or a tile layer that answers a tap. */
export function hasCard(
  definition: LayerDefinition,
): definition is FeedLayerDefinition | IdentifiableLayerDefinition {
  return isFeedLayer(definition) || isIdentifiable(definition);
}

/** The card a layer's features open: a feed's own, or an identifiable layer's nested one. */
export function cardOf(
  definition: FeedLayerDefinition | IdentifiableLayerDefinition,
): CardSpec {
  return isFeedLayer(definition) ? definition.card : definition.identify.card;
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
  style: PointStyle | FeedShapeStyle,
): style is FeedShapeStyle {
  return "kind" in style && style.kind === "shapes";
}
