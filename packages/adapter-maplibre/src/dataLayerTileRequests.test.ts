// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { DataLayerTileRequests } from "./dataLayerTileRequests";

const LAYER_TEMPLATE = "https://layers.example/wmts/{z}/{y}/{x}.png";
const LAYER_TILE = "https://layers.example/wmts/3/5/2.png";
const BASEMAP_TILE = "https://tiles.example/3/2/5.png";

describe("DataLayerTileRequests", () => {
  it("sends no referrer with a tile of a registered data layer", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    expect(requests.transform(LAYER_TILE, "Tile")).toEqual({
      url: LAYER_TILE,
      referrerPolicy: "no-referrer",
    });
  });

  it("leaves a request that is not a data layer's tile as it was", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    expect(requests.transform(BASEMAP_TILE, "Tile")).toEqual({
      url: BASEMAP_TILE,
    });
    expect(
      requests.transform("https://layers.example/other/3/5/2.png", "Tile"),
    ).toEqual({ url: "https://layers.example/other/3/5/2.png" });
  });

  it("reads every placeholder of a template, including a bounding box and a query", () => {
    const requests = new DataLayerTileRequests();
    requests.register(
      "mapcairn:a",
      "https://layers.example/wms?bbox={bbox-epsg-3857}&size=256&tile={quadkey}",
    );
    const tile =
      "https://layers.example/wms?bbox=-20037508,0,0,20037508&size=256&tile=0123";
    expect(requests.transform(tile, "Tile").referrerPolicy).toBe("no-referrer");
  });

  it("does not read a dot or other character of a template as a pattern", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", "https://layers.example/a.b/{z}.png");
    expect(
      requests.transform("https://layers.example/aXb/3.png", "Tile")
        .referrerPolicy,
    ).toBeUndefined();
  });

  it("stops applying the policy once the source is released", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    requests.release("mapcairn:a");
    expect(requests.transform(LAYER_TILE, "Tile")).toEqual({ url: LAYER_TILE });
  });

  it("drawing a source again replaces its template", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    requests.register("mapcairn:a", "https://new.example/{z}/{x}/{y}.png");
    expect(requests.transform(LAYER_TILE, "Tile").referrerPolicy).toBe(
      undefined,
    );
    expect(
      requests.transform("https://new.example/1/2/3.png", "Tile")
        .referrerPolicy,
    ).toBe("no-referrer");
  });
});
