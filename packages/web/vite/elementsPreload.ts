// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Plugin } from "vite";

/** What the server imports to learn the address of the elements chunk. */
export const ELEMENTS_CHUNK_MODULE = "virtual:mapcairn/elements-chunk";

const RESOLVED = `\0${ELEMENTS_CHUNK_MODULE}`;

/** The module of the map package that only a dynamic `import()` reaches. */
const ELEMENTS_SOURCE = "/map/src/lit/elements.ts";

/**
 * Gives the server build the address of the client chunk that holds the map's
 * private elements, so `/map` can ask the browser to fetch it beside the page's
 * other scripts instead of after the app has started. Nothing else lists it: a
 * chunk reached only by a dynamic `import()` gets no `modulepreload`, and
 * naming a chunk group for it makes other chunks import it statically, which
 * would run Lit on every page and on the server.
 *
 * The client builds first and its address is kept for the server's build. The
 * client's own copy of the module is `null`.
 */
export function elementsPreload(): Plugin {
  let address: string | undefined;
  return {
    name: "mapcairn:elements-preload",
    // One instance across the environments, so the address reaches the server's.
    sharedDuringBuild: true,
    resolveId: (id: string) =>
      id === ELEMENTS_CHUNK_MODULE ? RESOLVED : undefined,
    load(id: string) {
      if (id !== RESOLVED) {
        return undefined;
      }
      const known = this.environment.name === "ssr" ? address : undefined;
      return `export default ${JSON.stringify(known ?? null)};`;
    },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") {
        return;
      }
      const found = Object.values(bundle).find(
        (output) =>
          output.type === "chunk" &&
          output.facadeModuleId
            ?.replaceAll("\\", "/")
            .endsWith(ELEMENTS_SOURCE),
      );
      if (found === undefined) {
        throw new Error(
          "The map's private elements have no chunk of its own in the client build, so Lit is in a chunk that pages load whether or not they draw a map.",
        );
      }
      address = `/${found.fileName}`;
    },
  };
}
