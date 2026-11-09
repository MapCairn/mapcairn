/** One credit line a tile provider requires. */
export interface BasemapAttributionEntry {
  readonly text: string;
  /** Link target, when the provider requires the credit to link somewhere. */
  readonly href?: string;
}

/** Where a basemap's pixels come from. */
export type BasemapSource =
  | {
      readonly kind: "raster";
      /** A URL template with `{z}`, `{x}` and `{y}` placeholders. */
      readonly tileUrl: string;
      /**
       * Raster tiles are 256 px, the normalised zoom convention, so a tile's
       * `{z}` equals the normalised zoom it is drawn at.
       */
      readonly tileSize: 256;
    }
  | {
      readonly kind: "vector";
      /** A MapLibre style document URL. */
      readonly styleUrl: string;
    };

/**
 * A basemap, as data. This is the single source for the picker, the
 * attribution content and the thumbnails. Nothing else may name a tile URL or
 * an attribution string.
 */
export interface BasemapDefinition {
  readonly id: string;
  readonly name: string;
  readonly source: BasemapSource;
  /**
   * Normalised zoom limits (256 px tile convention). For a raster source,
   * `maxZoom` is also the deepest tile level the provider serves.
   */
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Public path of the committed preview image. */
  readonly thumbnail: string;
  /** Provider credits, in display order. */
  readonly attribution: readonly BasemapAttributionEntry[];
  /** Whether the basemap itself is light or dark, used for chrome contrast. */
  readonly appearance: "light" | "dark";
}
