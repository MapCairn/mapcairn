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
    }
  | {
      /**
       * Image tiles, such as satellite imagery, with the labels and roads of a
       * vector style drawn over them: a hybrid map. The engine adapter loads
       * the style, keeps only its layers that draw from `labelSourceLayers`
       * (so its land, water and buildings do not cover the imagery) and puts
       * the imagery under them.
       */
      readonly kind: "imagery";
      /** A URL template with `{z}`, `{x}` and `{y}` placeholders. */
      readonly tileUrl: string;
      /** 256 px tiles, so a tile's `{z}` equals the normalised zoom. */
      readonly tileSize: 256;
      /**
       * The deepest tile level with real detail. Deeper than this the engine
       * enlarges that level's tiles and asks for none, so the map can zoom in
       * further than the imagery for its labels and roads.
       */
      readonly maxTileZoom: number;
      /** A MapLibre style document URL whose labels and roads are drawn over the imagery. */
      readonly labelStyleUrl: string;
      /** The vector source layers of that style to keep, such as `place` and `transportation`. */
      readonly labelSourceLayers: readonly string[];
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
  /**
   * Public path of the committed preview image. A basemap with none is
   * shown in the picker as a plain colour swatch, as in Save data mode.
   */
  readonly thumbnail?: string;
  /**
   * A six-digit hex colour (`#rrggbb`) for the picker's plain swatch, which a
   * basemap with no preview image, and every basemap in Save data mode, shows.
   * Without it the swatch is the interface's map background colour, the
   * default basemap's land colour. Set it for a basemap that is not light, so
   * its tile does not look like the default one. It describes only the tile in
   * the picker and is the host's choice. It may be the style's own land colour
   * where the provider's terms allow it, and is otherwise a colour of the
   * host's own, never one sampled from the provider's map or screenshots.
   */
  readonly swatch?: string;
  /** Provider credits, in display order. */
  readonly attribution: readonly BasemapAttributionEntry[];
  /** Whether the basemap itself is light or dark, used for chrome contrast. */
  readonly appearance: "light" | "dark";
  /**
   * Ids of style layers a vector basemap leaves out in Save data mode, for
   * example a shaded-relief raster layer drawn at low zoom. The engine adapter
   * drops them, and any source only they use, when it sets the style, so
   * their tiles are never requested. Leave unset when nothing is worth
   * dropping. Ignored for a raster basemap, which has no style layers.
   */
  readonly saveDataOmitLayers?: readonly string[];
  /**
   * True when the provider's licence allows only non-commercial use. The SDK's
   * own basemaps have none, so it stays free for commercial use; a host that
   * accepts such terms may add one to its own catalogue. The ui never offers
   * such a basemap to an agent tool, because an agent must not accept a
   * provider's licence on a person's behalf.
   */
  readonly nonCommercial?: boolean;
}
