// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  IdentifiableLayerDefinition,
  LayerDefinition,
} from "../layers/definition";
import type { Bounds, LatLng } from "./geometry";

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

/** Where a tap landed, for a tile layer's `identify` request. */
export interface IdentifyTarget {
  /** The tapped place, with longitude wrapped to -180 up to 180. */
  readonly latlng: LatLng;
  /** The normalised zoom the map was at (see `toNormalisedZoom`). */
  readonly zoom: number;
}

/** What {@link LayerSource.load} needs. */
export interface LayerLoadRequest {
  /**
   * A feed, query or heatmap layer. Tile layers have nothing to load: a tile
   * layer's `identify` block is read when a tap asks (see
   * {@link LayerSource.identify}).
   */
  readonly definition: LayerDefinition;
  /**
   * The box of the map a query layer asks for (see `queryWindow`). Required
   * for a query layer and ignored for any other.
   */
  readonly area?: Bounds;
  /** Every control's value, already resolved (see `resolveControlValues`). */
  readonly controls: ControlValues;
  /** Today, as epoch milliseconds, for relative dates. */
  readonly now: number;
  readonly signal?: AbortSignal;
}

/** What {@link LayerSource.identify} needs. */
export interface LayerIdentifyRequest {
  /** A tile layer with an `identify` block. */
  readonly definition: IdentifiableLayerDefinition;
  /** Every control's value, already resolved (see `resolveControlValues`). */
  readonly controls: ControlValues;
  /** Today, as epoch milliseconds, for relative dates. */
  readonly now: number;
  /** Where the tap landed. */
  readonly at: IdentifyTarget;
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
 * Loads a feed layer's features, on request a feature's detail shapes, and
 * what a tile layer's service says is at a tap. One source serves every
 * definition: it reads the URL, the decoder and the filter from the
 * definition, so a new layer needs no new source.
 *
 * @remarks `load` and `loadDetail` reject only with a `LayerError`:
 *   `network` when the request failed, `invalid` when the response could not
 *   be decoded, `empty` when it decoded to no features, and `aborted` when the
 *   signal fired first.
 *
 *   `identify` rejects only with a `LayerError` too, but never with `empty`:
 *   nothing found is the common answer, so it resolves to an empty list.
 *   `network` includes a service that answered with an error status, which
 *   until an `unauthorised` kind exists includes 401 and 403. `invalid` is a
 *   URL that cannot be built or is not `https` (see `identifyRequestUrl`),
 *   and an answer that is not a document the decoder reads. A source keeps
 *   nothing an `identify` was answered with: every tap asks again. Core sets
 *   no limit on the size of an answer, because that belongs to the source: a
 *   source that reads from a network applies one of its own and refuses a
 *   larger answer as `invalid` (`FetchLayerSource` reads at most 1 MiB).
 */
export interface LayerSource {
  load(request: LayerLoadRequest): Promise<readonly LayerFeature[]>;
  loadDetail(request: LayerDetailRequest): Promise<readonly LayerFeature[]>;
  identify(request: LayerIdentifyRequest): Promise<readonly LayerFeature[]>;
}

/** Why a catalogue could not be loaded: the request failed, or its payload was not a list. */
export type CatalogueFailure = "network" | "invalid";

/**
 * Where a refresh of a catalogue that already has a list has got to. A failed
 * refresh keeps the list it had.
 */
export type CatalogueRefresh = "idle" | "loading" | "failed";

/** A definition a catalogue left out, with what was wrong with it. */
export interface SkippedDefinition {
  /** The definition's own `id`, when it had a text one. */
  readonly id?: string;
  /** Every problem found, as `path: message` lines. */
  readonly problems: readonly string[];
}

/**
 * What a {@link LayerCatalogue} holds. `ready` with no layers is a catalogue
 * that is empty, which is not the same as one still `loading`.
 */
export type CatalogueState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly reason: CatalogueFailure }
  | {
      readonly status: "ready";
      readonly layers: readonly LayerDefinition[];
      /** Values the host supplied that were not valid definitions. */
      readonly skipped: readonly SkippedDefinition[];
      readonly refresh: CatalogueRefresh;
    };

/**
 * The layers that exist, as definitions, and what is known about getting
 * them. It is a store that `useSyncExternalStore` can read: `getState` is
 * also the server snapshot, so a catalogue must answer it with no
 * subscription and without a browser.
 *
 * @remarks `getState` returns the same object until the state changes, and a
 *   subscriber is told once for each change. `refresh` never rejects: a
 *   failure is the state. A static catalogue never changes, so it is ready
 *   from the first read, never calls a subscriber and refreshes to nothing.
 *   No method uses `this`, so a caller may pass `getState` and `subscribe`
 *   on without the catalogue.
 */
export interface LayerCatalogue {
  getState(): CatalogueState;
  /** Calls `listener` after each change. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
  /**
   * Asks the catalogue to load again. Resolves when that attempt is over. The
   * state may change to `loading` before this returns or some time after, so a
   * caller must not read `getState()` straight after the call and expect it.
   */
  refresh(): Promise<void>;
}
