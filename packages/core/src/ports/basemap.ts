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
 * A credit a provider requires to stay on screen the whole time its basemap
 * is shown. Unlike the collapsing map credits, it is never hidden, collapsed
 * or covered by the sheet, the side panel, a toolbar or a control.
 */
export interface BasemapCredit {
  readonly kind: "permanent";
  /** The provider's logo, drawn as an image that links to the provider. */
  readonly logo: {
    /** Public path or URL of the image. */
    readonly src: string;
    /** Where the logo links to. */
    readonly href: string;
    /** The image's text alternative, and the link's name. */
    readonly label: string;
    /**
     * The least height, in CSS pixels, the provider allows the logo to be
     * drawn at. The ui draws it at exactly this height.
     */
    readonly minHeight: number;
  };
  /** The credit lines shown beside the logo, in order. */
  readonly lines: readonly BasemapAttributionEntry[];
}

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
   * A credit that stays on screen at all times while this basemap is shown
   * or loading, in place of relying on the collapsing credits alone. Leave
   * unset when the provider's credits may collapse.
   */
  readonly credit?: BasemapCredit;
  /**
   * `false` when the provider's terms do not allow saving an image of the map.
   * The ui then turns Save image off and the adapter refuses `toImage`.
   * Unset means allowed.
   */
  readonly allowsImageExport?: false;
}
