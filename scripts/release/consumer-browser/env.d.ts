// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The URL Vite gives the engine's worker file, for the adapter's `loadWorkerUrl`. */
declare module "*?worker&url" {
  const url: string;
  export default url;
}

/** The app's own plain stylesheets, imported for their side effect. */
declare module "*.css";

interface ImportMeta {
  readonly env: {
    /** The address of the style the page's one basemap names, from `.env.production`. */
    readonly VITE_STYLE_URL: string;
  };
}
