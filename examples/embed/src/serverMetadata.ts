// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * What a made-up GIS server says about its layers. It is not a real service's
 * format: it has the kinds of thing such servers describe, so that
 * `mapServerLayers` can show how a host turns its own server's metadata into
 * layer definitions.
 */

/** The kinds of attribute the server's field list names. */
export type ServerFieldType =
  | "oid"
  | "string"
  | "integer"
  | "double"
  | "date"
  | "blob";

/** One attribute of a layer's features. */
export interface ServerField {
  /** The attribute's name in each feature's `properties`. */
  readonly name: string;
  /** What a person reads. */
  readonly label: string;
  readonly type: ServerFieldType;
}

/** Colours every feature alike. */
export interface SimpleRenderer {
  readonly type: "simple";
  readonly label: string;
}

/** Colours by the value of one attribute, one class for each listed value. */
export interface UniqueValueRenderer {
  readonly type: "uniqueValue";
  readonly field: string;
  readonly values: readonly {
    readonly value: string | number;
    readonly label: string;
  }[];
  /** The class for every other value. */
  readonly otherLabel: string;
}

/** Colours by the range a numeric attribute falls in, from explicit breaks. */
export interface ClassBreaksRenderer {
  readonly type: "classBreaks";
  readonly field: string;
  /** Ascending. Each class starts at its `min`. */
  readonly breaks: readonly {
    readonly min: number;
    readonly label: string;
  }[];
}

/** Colours by the range a numeric attribute falls in, in equal classes. */
export interface EqualIntervalRenderer {
  readonly type: "equalInterval";
  readonly field: string;
  readonly min: number;
  readonly max: number;
  readonly classes: number;
  /** Appended to the legend's numbers, such as ` mm`. */
  readonly unit?: string;
}

/** How a layer's features are coloured. */
export type ServerRenderer =
  | SimpleRenderer
  | UniqueValueRenderer
  | ClassBreaksRenderer
  | EqualIntervalRenderer;

/** A layer the server sends as one document of features. */
export interface FeatureService {
  readonly kind: "features";
  readonly url: string;
}

/** A layer the server draws as map tiles. */
export interface TileService {
  readonly kind: "tiles";
  readonly url: string;
  readonly tileSize: 256 | 512;
  readonly maxZoom: number;
  /** What the colours in the tiles mean, lowest first. */
  readonly legend: readonly { readonly label: string }[];
}

/** One layer, as the server describes it. */
export interface ServerLayer {
  /** The server's own id, in whatever form it uses. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly geometryType: "point" | "polygon" | "polyline";
  readonly fields: readonly ServerField[];
  readonly renderer: ServerRenderer;
  readonly service: FeatureService | TileService;
  /** Keeps only the features whose `field` has one of these values. */
  readonly visibleValues?: {
    readonly field: string;
    readonly values: readonly (string | number)[];
  };
  /** Roughly what turning the layer on downloads, such as `about 4 KB`. */
  readonly approximateSize: string;
  readonly credit: { readonly text: string; readonly url?: string };
}

/** The server's answer to a request for its layers. */
export interface ServerLayerList {
  readonly layers: readonly ServerLayer[];
}
