// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  mergedStylesheet,
  moduleIdsOf,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/bundleOutput.mjs";

describe("moduleIdsOf", () => {
  it("lists the modules of every chunk once, and none from an asset", () => {
    expect(
      moduleIdsOf({
        "browser.js": { type: "chunk", modules: { "/a.js": {}, "/b.js": {} } },
        "browser-engine.js": {
          type: "chunk",
          modules: { "/b.js": {}, "/c.js": {} },
        },
        "browser.css": { type: "asset", modules: { "/d.css": {} } },
        "empty.js": { type: "chunk" },
      }),
    ).toEqual(["/a.js", "/b.js", "/c.js"]);
  });

  it("lists nothing for an empty bundle", () => {
    expect(moduleIdsOf({})).toEqual([]);
  });
});

describe("mergedStylesheet", () => {
  it("puts the engine's rules in front of the bundle's own", () => {
    expect(
      mergedStylesheet(
        ".engine{}",
        { type: "asset", source: ".own{}" },
        "x.css",
      ),
    ).toBe(".engine{}\n.own{}");
  });

  it("fails when the bundle has no stylesheet, or one that is a chunk", () => {
    expect(() => mergedStylesheet(".e{}", undefined, "browser.css")).toThrow(
      "The bundle has no browser.css to merge the engine's stylesheet into.",
    );
    expect(() =>
      mergedStylesheet(".e{}", { type: "chunk" }, "browser.css"),
    ).toThrow(/no browser\.css/);
  });
});
