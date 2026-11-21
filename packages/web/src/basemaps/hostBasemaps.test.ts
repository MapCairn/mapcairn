// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  BASEMAPS,
  DEFAULT_BASEMAP_ID,
  DEFAULT_DARK_BASEMAP_ID,
  defaultBasemapFor,
  FakeMessageCatalogue,
  getBasemap,
  resolveText,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { BASEMAP_THUMBNAILS } from "./basemapThumbnails";
import {
  HOST_BASEMAP_CATALOGUE,
  HOST_BASEMAP_IDS,
  selectBasemaps,
} from "./hostBasemaps";

/** The folder the site serves at its root, where a thumbnail path points. */
const PUBLIC_DIRECTORY = join(__dirname, "../../public");

describe("the reference host's basemaps", () => {
  it("offers six basemaps, in this order", () => {
    expect(HOST_BASEMAP_IDS).toEqual([
      "bright",
      "liberty",
      "positron",
      "osm",
      "fiord",
      "dark",
    ]);
    expect(
      HOST_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.id),
    ).toEqual([...HOST_BASEMAP_IDS]);
    const english = new FakeMessageCatalogue();
    expect(
      HOST_BASEMAP_CATALOGUE.basemaps.map((basemap) =>
        resolveText(english, basemap.name),
      ),
    ).toEqual(["Bright", "Liberty", "Positron", "Streets", "Fiord", "Dark"]);
  });

  it("holds no basemap whose terms bar commercial use, in the host or the SDK", () => {
    for (const basemap of [...HOST_BASEMAP_CATALOGUE.basemaps, ...BASEMAPS]) {
      expect(basemap.nonCommercial, basemap.id).not.toBe(true);
    }
  });

  it("makes Bright the default, and the light theme's default", () => {
    expect(HOST_BASEMAP_CATALOGUE.defaultId).toBe(DEFAULT_BASEMAP_ID);
    expect(HOST_BASEMAP_CATALOGUE.defaultId).toBe("bright");
    expect(HOST_BASEMAP_CATALOGUE.basemaps[0]?.id).toBe("bright");
    expect(defaultBasemapFor(HOST_BASEMAP_CATALOGUE, "light").id).toBe(
      "bright",
    );
  });

  it("makes Fiord the dark theme's default", () => {
    expect(DEFAULT_DARK_BASEMAP_ID).toBe("fiord");
    expect(defaultBasemapFor(HOST_BASEMAP_CATALOGUE, "dark").id).toBe("fiord");
  });

  it("opens an id the site does not offer on Bright, including the removed Satellite and Topographic", () => {
    for (const id of [
      "satellite",
      "topographic",
      "colorful",
      "auto",
      "maptoolkit-dark",
      "",
      "__proto__",
    ]) {
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).toBeUndefined();
      expect(HOST_BASEMAP_CATALOGUE.resolve(id).id, id).toBe("bright");
    }
  });

  it("names a preview for every basemap it offers, and the site serves each file", () => {
    for (const basemap of HOST_BASEMAP_CATALOGUE.basemaps) {
      expect(basemap.thumbnail, basemap.id).toBeDefined();
      const file = join(PUBLIC_DIRECTORY, basemap.thumbnail ?? "");
      expect(existsSync(file), `${basemap.id}: ${file}`).toBe(true);
    }
  });

  it("resolves each offered id to itself", () => {
    for (const id of HOST_BASEMAP_IDS) {
      expect(HOST_BASEMAP_CATALOGUE.resolve(id).id).toBe(id);
    }
  });

  it("uses the SDK's definitions for all six, with the host's preview added and nothing else changed", () => {
    for (const id of HOST_BASEMAP_IDS) {
      expect(getBasemap(id)?.thumbnail, id).toBeUndefined();
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).toEqual({
        ...getBasemap(id),
        thumbnail: `/basemaps/${id}.jpg`,
      });
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).not.toBe(getBasemap(id));
    }
  });

  it("leaves every SDK definition without a preview", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.thumbnail, basemap.id).toBeUndefined();
    }
  });

  it("lists a preview for exactly the basemaps it offers, each the jpg of its own id", () => {
    expect(Object.keys(BASEMAP_THUMBNAILS).sort()).toEqual(
      [...HOST_BASEMAP_IDS].sort(),
    );
    for (const [id, path] of Object.entries(BASEMAP_THUMBNAILS)) {
      expect(path, id).toBe(`/basemaps/${id}.jpg`);
    }
  });

  it("names the id when the SDK has no such basemap, rather than offering fewer", () => {
    expect(() => selectBasemaps(["bright", "atlantis"])).toThrow(
      /no basemap "atlantis"/,
    );
    expect(() => selectBasemaps(["topographic"])).toThrow(
      /no basemap "topographic"/,
    );
    expect(() => selectBasemaps(["satellite"])).toThrow(
      /no basemap "satellite"/,
    );
    expect(
      selectBasemaps(["osm", "bright"]).map((basemap) => basemap.id),
    ).toEqual(["osm", "bright"]);
  });

  it("leaves the SDK's list with seven, so Colorful, which the host does not offer, stays available to other hosts", () => {
    expect(BASEMAPS).toHaveLength(7);
    expect(BASEMAPS.some((basemap) => basemap.id === "colorful")).toBe(true);
  });
});
