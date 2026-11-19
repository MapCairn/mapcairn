// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { FontaineTransform } from "fontaine";
import { tsImport } from "tsx/esm/api";
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
  type Plugin,
} from "vite";
import { OFFERED_LANGUAGE_OPTIONS } from "./src/i18n/offeredLanguageOptions.ts";

/**
 * `@vanilla-extract/vite-plugin` marks its runtime packages external for the
 * server build, which suits Node. The Cloudflare plugin builds that same
 * environment for the Worker, where nothing outside the bundle can be
 * imported and the plugin rejects `resolve.external`, so the Worker bundles
 * them instead. The plugin offers no option to leave the list out, and a
 * returned config can only add to it, so this clears the list in place.
 */
const bundleVanillaExtractIntoWorker = (): Plugin => ({
  name: "mapcairn:bundle-vanilla-extract-into-worker",
  configEnvironment(name, options) {
    if (name === "ssr" && options.resolve) {
      options.resolve.external = [];
    }
  },
});

/**
 * The map engine is loaded in the browser, when a map mounts, through dynamic
 * imports in the MapLibre adapter. The Worker's environment still follows those
 * imports and would bundle the engine, its worker script and its stylesheet,
 * about 1.4 MB that nothing runs on the server and that the client build already
 * serves from the static assets. This answers them with an empty module in
 * that environment only.
 */
const keepBrowserEngineOutOfWorker = (): Plugin => {
  const engineModule = /^maplibre-gl(?:\/|$)/;
  const emptyModule = "\0mapcairn:browser-engine-stub";
  return {
    name: "mapcairn:keep-browser-engine-out-of-worker",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name === "ssr",
    resolveId: (id) => (engineModule.test(id) ? emptyModule : undefined),
    load: (id) =>
      id === emptyModule ? "export default undefined;" : undefined,
  };
};

export default defineConfig(async ({ mode, command, isPreview }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";
  // The Worker entry imports the built server bundle, so the Cloudflare plugin
  // only applies to production builds. Dev serves the app with plain Vite SSR.
  const useCloudflare = command === "build" || isPreview === true;
  const { languageDirection } = (await tsImport(
    "@mapcairn/core",
    import.meta.url,
  )) as typeof import("@mapcairn/core");

  return {
    cacheDir: "node_modules/.vite",
    // Inside Vite the SDK packages resolve to their source, for hot reload and
    // so tests run what is written. A set list replaces Vite's defaults, so
    // they are spread back in.
    resolve: { conditions: ["@mapcairn/source", ...defaultClientConditions] },
    environments: {
      ssr: {
        resolve: {
          conditions: ["@mapcairn/source", ...defaultServerConditions],
        },
        // Wrangler uploaded no source maps for this Worker, and `cf deploy`
        // uploads every map in the Build Output, so the Worker's environment
        // makes none. The client build keeps its own setting.
        ...(useCloudflare ? { build: { sourcemap: false } } : {}),
      },
    },
    define: {
      __MAPCAIRN_HOST_LANGUAGE_DIRECTIONS__: JSON.stringify(
        OFFERED_LANGUAGE_OPTIONS.map(({ tag }) =>
          languageDirection(tag, OFFERED_LANGUAGE_OPTIONS),
        ),
      ),
    },
    plugins: [
      // Must run before reactRouter()/cloudflare()/react(): .css.ts files
      // need to resolve to plain CSS before route/SSR transformation or the
      // JSX transform ever sees them.
      vanillaExtractPlugin(),
      ...(useCloudflare
        ? [bundleVanillaExtractIntoWorker(), keepBrowserEngineOutOfWorker()]
        : []),
      ...(isTest
        ? [react()]
        : [
            ...(useCloudflare
              ? [cloudflare({ viteEnvironment: { name: "ssr" } })]
              : []),
            reactRouter(),
            FontaineTransform.vite({
              fallbacks: ["Arial", "sans-serif"],
              // IBM Plex Sans has a hand-declared "IBM Plex Sans Fallback" in
              // src/fonts/fonts.css, with metrics derived from the font file.
              // Its @font-face names a bare package path that fontaine cannot
              // resolve, so skip it rather than emit a second, unused face.
              skipFontFaceGeneration: (name) =>
                name === "IBM Plex Sans Variable fallback",
              resolvePath: (id) =>
                new URL(`./node_modules/${id}`, import.meta.url),
            }),
          ]),
    ],
    build: {
      assetsInlineLimit: 0,
      cssCodeSplit: true,
      /**
       * `maplibre-gl` (which the MapLibre adapter imports dynamically) is
       * about 300KB gzipped on its own and passes Vite's default 500kB
       * warning threshold however it is split. It is an async chunk, never
       * part of the initial bundle, so the limit sits above its known size
       * rather than letting an expected lazy chunk hide warnings about
       * future eagerly loaded bloat.
       */
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          entryFileNames: "assets/js/[name]-[hash].js",
          chunkFileNames: "assets/js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            const firstName = assetInfo.names?.[0] ?? assetInfo.name ?? "";

            if (/\.css$/i.test(firstName)) {
              return "assets/css/[name]-[hash][extname]";
            }

            if (/\.(woff2?|ttf|otf|eot)$/i.test(firstName)) {
              return "assets/fonts/[name]-[hash][extname]";
            }

            if (/\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(firstName)) {
              return "assets/img/[name]-[hash][extname]";
            }

            return "assets/misc/[name]-[hash][extname]";
          },
          codeSplitting: {
            groups: [
              /**
               * `react-dom`'s server renderer is deliberately *not* matched
               * here, so it isn't pulled into the vendor chunk every visitor
               * downloads before the map can paint. `MapView` imports it
               * dynamically (to render a feature popup's markup on first
               * click); leaving it ungrouped lets that stay a genuinely
               * async chunk, whereas naming a group for it makes React
               * Router emit a `modulepreload` for the chunk and fetch it up
               * front anyway.
               */
              {
                name: "react-vendor",
                test: /node_modules\/(?:(?:react|scheduler)\/|react-dom\/(?!server|cjs\/react-dom-server))/,
              },
              {
                name: "ui-vendor",
                test: /node_modules\/(lucide-react|zod)\//,
              },
              // MapLibre has no group on purpose. The engine adapter imports
              // it (and its stylesheet) dynamically, so it stays an async
              // chunk fetched when the map mounts; a named group would get a
              // modulepreload and block the first paint of the page.
            ],
          },
        },
      },
    },
    test: {
      // The worker imports React Router's virtual server build; tests use a
      // stand-in so they run without the React Router plugin, which test mode
      // leaves out.
      alias: {
        "virtual:react-router/server-build": fileURLToPath(
          new URL("./workers/testServerBuild.ts", import.meta.url),
        ),
      },
      environment: "happy-dom",
      setupFiles: ["./vitest.setup.ts"],
      globals: true,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.{idea,git,cache,output,temp}/**",
        "e2e/**",
      ],
    },
  };
});
