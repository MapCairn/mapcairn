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
    expect(requests.transform(LAYER_TILE)).toEqual({
      url: LAYER_TILE,
      referrerPolicy: "no-referrer",
    });
  });

  it("leaves a request that is not a data layer's tile as it was", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    expect(requests.transform(BASEMAP_TILE)).toEqual({
      url: BASEMAP_TILE,
    });
    expect(
      requests.transform("https://layers.example/other/3/5/2.png"),
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
    expect(requests.transform(tile).referrerPolicy).toBe("no-referrer");
  });

  it("does not read a dot or other character of a template as a pattern", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", "https://layers.example/a.b/{z}.png");
    expect(
      requests.transform("https://layers.example/aXb/3.png").referrerPolicy,
    ).toBeUndefined();
  });

  it("stops applying the policy once the source is released", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    requests.release("mapcairn:a");
    expect(requests.transform(LAYER_TILE)).toEqual({ url: LAYER_TILE });
  });

  it("drawing a source again replaces its template", () => {
    const requests = new DataLayerTileRequests();
    requests.register("mapcairn:a", LAYER_TEMPLATE);
    requests.register("mapcairn:a", "https://new.example/{z}/{x}/{y}.png");
    expect(requests.transform(LAYER_TILE).referrerPolicy).toBe(undefined);
    expect(
      requests.transform("https://new.example/1/2/3.png").referrerPolicy,
    ).toBe("no-referrer");
  });

  it("does not match a basemap URL on the same host that differs in path", () => {
    const requests = new DataLayerTileRequests();
    requests.register(
      "mapcairn:a",
      "https://tiles.example/layer/{z}/{x}/{y}.png",
    );
    expect(
      requests.transform("https://tiles.example/basemap/3/2/5.png")
        .referrerPolicy,
    ).toBeUndefined();
    expect(
      requests.transform("https://tiles.example/layer/3/2/5/extra.png")
        .referrerPolicy,
    ).toBeUndefined();
  });

  it("does not let a placeholder run across a query separator", () => {
    const requests = new DataLayerTileRequests();
    requests.register(
      "mapcairn:a",
      "https://t.example/wms?bbox={bbox-epsg-3857}&size=256",
    );
    expect(
      requests.transform("https://t.example/wms?bbox=1,2,3,4&size=256")
        .referrerPolicy,
    ).toBe("no-referrer");
    expect(
      requests.transform("https://t.example/wms?bbox=1&other=2&size=256")
        .referrerPolicy,
    ).toBeUndefined();
  });

  it("answers a long URL against a template of many placeholders without backtracking", () => {
    const requests = new DataLayerTileRequests();
    const template = `https://t.example/${"{z}{x}-".repeat(40)}end`;
    requests.register("mapcairn:a", template);
    const miss = `https://t.example/${"1-".repeat(5000)}nope`;
    const started = performance.now();
    expect(requests.transform(miss).referrerPolicy).toBeUndefined();
    // A generous bound: a backtracking match of this size runs for minutes.
    expect(performance.now() - started).toBeLessThan(1000);
    const hit = `https://t.example/${"1-".repeat(40)}end`;
    expect(requests.transform(hit).referrerPolicy).toBe("no-referrer");
  });

  it("matches the tile URLs of the host's own WMTS and WMS layers", () => {
    const requests = new DataLayerTileRequests();
    requests.register(
      "mapcairn:wmts",
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
    );
    requests.register(
      "mapcairn:wms",
      "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_Thermal_Anomalies_All&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=2026-06-15",
    );
    for (const url of [
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/GoogleMapsCompatible_Level7/5/12/20.png",
      "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_Thermal_Anomalies_All&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX=-20037508.34,0,-10018754.17,10018754.17&TIME=2026-06-15",
    ]) {
      expect(requests.transform(url).referrerPolicy).toBe("no-referrer");
    }
  });
});
