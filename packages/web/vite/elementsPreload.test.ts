// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { ELEMENTS_CHUNK_MODULE, elementsPreload } from "./elementsPreload";

/** The plugin's hooks, called as Vite calls them in one environment. */
function hooks(plugin: ReturnType<typeof elementsPreload>) {
  const call = (name: string, environment: string, ...args: unknown[]) =>
    (plugin as unknown as Record<string, (...all: unknown[]) => unknown>)[
      name
    ]?.call({ environment: { name: environment } }, ...args);
  return {
    sharedDuringBuild: plugin.sharedDuringBuild,
    resolve: (id: string) => call("resolveId", "ssr", id) as string | undefined,
    load: (environment: string, id: string) =>
      call("load", environment, id) as string | undefined,
    bundle: (environment: string, chunks: object[]) =>
      call(
        "generateBundle",
        environment,
        {},
        Object.fromEntries(chunks.map((output, at) => [String(at), output])),
      ),
  };
}

const chunk = (fileName: string, facadeModuleId: string | null) => ({
  type: "chunk",
  fileName,
  facadeModuleId,
});

const ELEMENTS = "/repo/packages/map/src/lit/elements.ts";

describe("elementsPreload", () => {
  function built() {
    const plugin = hooks(elementsPreload());
    plugin.bundle("client", [
      { type: "asset", fileName: "assets/css/root.css" },
      chunk("assets/js/map-1.js", "/repo/packages/web/src/routes/map.tsx"),
      chunk("assets/js/shared-2.js", null),
      chunk("assets/js/elements-3.js", ELEMENTS),
    ]);
    return plugin;
  }
  const resolved = (plugin: ReturnType<typeof hooks>) =>
    plugin.resolve(ELEMENTS_CHUNK_MODULE) as string;

  it("tells the server build the address of the client's elements chunk", () => {
    const plugin = built();

    expect(plugin.sharedDuringBuild).toBe(true);
    expect(plugin.load("ssr", resolved(plugin))).toBe(
      'export default "/assets/js/elements-3.js";',
    );
  });

  it("tells the client build nothing, since it cannot name its own chunk and preloads nothing", () => {
    const plugin = built();

    expect(plugin.load("client", resolved(plugin))).toBe(
      "export default null;",
    );
  });

  it("says nothing where no client was built, as in development and in tests", () => {
    const plugin = hooks(elementsPreload());

    expect(plugin.load("ssr", resolved(plugin))).toBe("export default null;");
  });

  it("fails a client build that has no chunk of its own for the elements", () => {
    const plugin = hooks(elementsPreload());

    expect(() =>
      plugin.bundle("client", [chunk("assets/js/map-1.js", "/repo/a.ts")]),
    ).toThrow("no chunk of its own");
  });

  it("leaves every other module and the server's own bundle alone", () => {
    const plugin = hooks(elementsPreload());

    expect(plugin.resolve("react")).toBeUndefined();
    expect(plugin.load("ssr", "/repo/a.ts")).toBeUndefined();
    expect(() => plugin.bundle("ssr", [])).not.toThrow();
  });
});
