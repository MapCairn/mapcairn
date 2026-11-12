import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BASEMAP_THUMBNAILS } from "./basemapThumbnails";

describe("the basemap preview table", () => {
  it("imports nothing, so the thumbnail script can load it with plain Node", () => {
    const source = readFileSync(
      resolve(__dirname, "basemapThumbnails.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^\s*(import|export\s+.*\sfrom)\s/m);
  });

  it("points every preview inside the site's basemaps folder", () => {
    for (const [id, path] of Object.entries(BASEMAP_THUMBNAILS)) {
      expect(path, id).toMatch(/^\/basemaps\/[a-z-]+\.jpg$/);
    }
  });
});
