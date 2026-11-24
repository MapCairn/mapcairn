// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { HtmlTagDescriptor } from "vite";

/** The file the generated theme stylesheet is served as, at the site's root. */
export const THEME_STYLESHEET_FILE = "example-themes.css";

/** The part of a Vite dev server this plugin uses. */
interface DevServer {
  middlewares: {
    use(
      path: string,
      handler: (
        request: unknown,
        response: {
          setHeader(name: string, value: string): void;
          end(body: string): void;
        },
      ) => void,
    ): void;
  };
}

/** The part of a Rollup plugin context this plugin uses. */
interface BundleContext {
  emitFile(file: { type: "asset"; fileName: string; source: string }): void;
}

/**
 * A Vite plugin that serves a generated stylesheet as a real file, in the dev
 * server and in the build, and links it from the page. The page's policy
 * (`style-src 'self'`) refuses an inline `<style>`, so the text has to be a
 * file. It is generated again on every dev request and on every build, so it
 * never goes stale.
 *
 * @param createCss - Makes the stylesheet text.
 * @returns The plugin.
 */
export function themeStylesheetPlugin(createCss: () => string) {
  return {
    name: "example-theme-stylesheet",
    configureServer(server: DevServer): void {
      server.middlewares.use(
        `/${THEME_STYLESHEET_FILE}`,
        (_request, response) => {
          response.setHeader("Content-Type", "text/css; charset=utf-8");
          response.end(createCss());
        },
      );
    },
    generateBundle(this: BundleContext): void {
      this.emitFile({
        type: "asset",
        fileName: THEME_STYLESHEET_FILE,
        source: createCss(),
      });
    },
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        {
          tag: "link",
          attrs: { rel: "stylesheet", href: `/${THEME_STYLESHEET_FILE}` },
          injectTo: "head",
        },
      ];
    },
  };
}
