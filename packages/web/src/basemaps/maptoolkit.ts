import type {
  BasemapAttributionEntry,
  BasemapDefinition,
} from "@mapcairn/core";

/** The id of Maptoolkit Dark, a manual choice that never follows the theme. */
export const MAPTOOLKIT_DARK_ID = "maptoolkit-dark";

/** The picker's swatch for Maptoolkit Dark: a neutral dark, chosen here. */
const MAPTOOLKIT_DARK_SWATCH = "#22262c";

/**
 * The credit lines the Maptoolkit Community License (section 8) prescribes,
 * word for word, each linked to the page the licence names. They sit in the
 * permanent credit and also in the collapsing credit list and the saved-image
 * line, so no credit surface leaves them out.
 */
const MAPTOOLKIT_CREDIT_LINES: readonly BasemapAttributionEntry[] = [
  { text: "© Maptoolkit", href: "https://www.maptoolkit.com/copyright/" },
  {
    text: "© Openstreetmap",
    href: "https://www.openstreetmap.org/copyright",
  },
];

/**
 * Maptoolkit's Dark vector style, loaded from the community tile server under
 * the Maptoolkit Community License (https://www.maptoolkit.org/tos). The
 * licence is the host's to accept, so this definition lives here and not in
 * the SDK. It sets two conditions on the host:
 *
 * - Section 8: the Maptoolkit logo (at least 24 CSS pixels high, linking to
 *   maptoolkit.org) and "© Maptoolkit © Openstreetmap" stay visible at every
 *   size, never collapsed or covered. `credit` carries both, and `MapChrome`
 *   gives the credit a row of its own.
 * - Section 7: no static exports, so `allowsImageExport` is false and Save
 *   image is turned off while this basemap is shown or loading.
 *
 * It has no preview image: a picture of the provider's map is a static copy
 * the licence does not allow, so the picker shows its plain swatch, a neutral
 * dark of our own choosing (`swatch`), not a colour taken from the provider's
 * style or screenshots.
 */
export const MAPTOOLKIT_DARK: BasemapDefinition = {
  id: MAPTOOLKIT_DARK_ID,
  name: "Maptoolkit Dark",
  source: {
    kind: "vector",
    styleUrl: "https://styles.maptoolkit.org/dark.json",
  },
  minZoom: 0,
  maxZoom: 22,
  attribution: MAPTOOLKIT_CREDIT_LINES,
  appearance: "dark",
  swatch: MAPTOOLKIT_DARK_SWATCH,
  allowsImageExport: false,
  credit: {
    kind: "permanent",
    logo: {
      src: "/basemaps/maptoolkit-logo.svg",
      href: "https://www.maptoolkit.org/",
      label: "Maptoolkit",
      minHeight: 24,
    },
    lines: MAPTOOLKIT_CREDIT_LINES,
  },
};
