import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { FontaineTransform } from "fontaine";
import { defineConfig } from "vite";

export default defineConfig(({ mode, command }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";
  // The Worker entry imports the built server bundle, so the Cloudflare plugin
  // only applies to production builds. Dev serves the app with plain Vite SSR.
  const useCloudflare = command === "build";

  return {
    cacheDir: "node_modules/.vite",
    plugins: [
      // Must run before reactRouter()/cloudflare()/react(): .css.ts files
      // need to resolve to plain CSS before route/SSR transformation or the
      // JSX transform ever sees them.
      vanillaExtractPlugin(),
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
                test: /node_modules\/(lucide-react|zustand|usehooks-ts|zod)\//,
              },
              // Leaflet and MapLibre have no group on purpose. Each engine
              // adapter imports its library (and its stylesheet) dynamically,
              // so each stays an async chunk fetched only when a basemap
              // needs that engine; a named group would get a modulepreload
              // and download both engines on every visit.
            ],
          },
        },
      },
    },
    test: {
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
