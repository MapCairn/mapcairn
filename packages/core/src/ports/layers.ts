import type { LayerDefinition } from "../layers/definition";

/** A decoded field value. Anything else in a response is dropped. */
export type FieldValue = string | number | boolean | null;

/** A longitude and latitude pair, in that order, as GeoJSON writes it. */
export type Position = readonly [number, number];

/**
 * The geometry of a decoded feature: the GeoJSON types a layer can draw.
 * Positions keep longitude first and drop any third value (depth is mapped
 * into a field instead).
 */
export type LayerGeometry =
  | { readonly type: "Point"; readonly coordinates: Position }
  | { readonly type: "LineString"; readonly coordinates: readonly Position[] }
  | {
      readonly type: "MultiLineString";
      readonly coordinates: readonly (readonly Position[])[];
    }
  | {
      readonly type: "Polygon";
      readonly coordinates: readonly (readonly Position[])[];
    }
  | {
      readonly type: "MultiPolygon";
      readonly coordinates: readonly (readonly (readonly Position[])[])[];
    };

/** One decoded feature: an id, its geometry and the fields its definition maps. */
export interface LayerFeature {
  /** Unique inside one load of one layer. */
  readonly id: string;
  readonly geometry: LayerGeometry;
  readonly fields: Readonly<Record<string, FieldValue>>;
}

/** The value of each of a layer's controls, as strings, by control id. */
export type ControlValues = Readonly<Record<string, string>>;

/** What {@link LayerSource.load} needs. */
export interface LayerLoadRequest {
  /** A feed layer. Tile layers have nothing to load. */
  readonly definition: LayerDefinition;
  /** Every control's value, already resolved (see `resolveControlValues`). */
  readonly controls: ControlValues;
  /** Today, as epoch milliseconds, for relative dates. */
  readonly now: number;
  readonly signal?: AbortSignal;
}

/** What {@link LayerSource.loadDetail} needs. */
export interface LayerDetailRequest {
  readonly definition: LayerDefinition;
  /** The feature whose detail (such as an affected area) is wanted. */
  readonly feature: LayerFeature;
  readonly signal?: AbortSignal;
}

/**
 * Loads a feed layer's features, and on request a feature's detail shapes.
 * One source serves every definition: it reads the URL, the decoder and the
 * filter from the definition, so a new layer needs no new source.
 *
 * @remarks Rejects only with a `LayerError`: `network` when the request
 *   failed, `invalid` when the response could not be decoded, `empty` when it
 *   decoded to no features, and `aborted` when the signal fired first.
 */
export interface LayerSource {
  load(request: LayerLoadRequest): Promise<readonly LayerFeature[]>;
  loadDetail(request: LayerDetailRequest): Promise<readonly LayerFeature[]>;
}

/**
 * Lists the layers that exist, as definitions. Empty for a host with no
 * layers, so the sheet's Layers section is not shown.
 */
export interface LayerRegistry {
  list(): readonly LayerDefinition[];
}
