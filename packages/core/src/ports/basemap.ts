/** One credit line a tile provider requires. */
export interface BasemapAttributionEntry {
  readonly text: string;
  /** Link target, when the provider requires the credit to link somewhere. */
  readonly href?: string;
}

/** The engine that renders a basemap. Only adapters branch on this. */
export type BasemapEngineId = "leaflet" | "maplibre";

/** Where a basemap's pixels come from. */
export type BasemapSource =
  | {
      readonly kind: "raster";
      /** A URL template with `{z}`, `{x}` and `{y}` placeholders. */
      readonly tileUrl: string;
      readonly tileSize: 256 | 512;
    }
  | {
      readonly kind: "vector";
      /** A MapLibre style document URL. */
      readonly styleUrl: string;
    };

/**
 * A basemap, as data. This is the single source for the picker, the
 * attribution content, the engine choice, the thumbnails and the
 * "Auto follows theme" logic. Nothing else may name a tile URL or an
 * attribution string.
 */
export interface BasemapDefinition {
  readonly id: string;
  readonly name: string;
  readonly engine: BasemapEngineId;
  readonly source: BasemapSource;
  /** Normalised zoom limits (256 px tile convention). */
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Public path of the committed preview image. */
  readonly thumbnail: string;
  /** Provider credits, in display order. */
  readonly attribution: readonly BasemapAttributionEntry[];
  /** Whether the basemap itself is light or dark, used for chrome contrast. */
  readonly appearance: "light" | "dark";
  /** The basemap to use instead when the interface theme is dark and "Auto" is chosen. */
  readonly darkVariantId?: string;
}
