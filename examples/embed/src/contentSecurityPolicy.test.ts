// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BASEMAPS,
  type BasemapDefinition,
  type FeedLayerDefinition,
  type HeatmapLayerDefinition,
  type TileLayerDefinition,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { CAIRNS_LAYER } from "./cairnsLayer";
import { buildContentSecurityPolicy } from "./contentSecurityPolicy";

/** The sources of one directive in a built policy. */
function sources(policy: string, directive: string): string[] {
  const line = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `));
  if (line === undefined) {
    throw new Error(`The policy has no ${directive} directive.`);
  }
  return line.split(/\s+/).slice(1);
}

const RASTER_BASEMAP: BasemapDefinition = {
  id: "plain",
  name: "Plain",
  source: {
    kind: "raster",
    tileUrl: "https://tiles.example.net/{z}/{x}/{y}.png",
    tileSize: 256,
  },
  minZoom: 0,
  maxZoom: 19,
  attribution: [],
  appearance: "light",
};

const VECTOR_BASEMAP: BasemapDefinition = {
  id: "vector",
  name: "Vector",
  source: { kind: "vector", styleUrl: "https://styles.example.net/a.json" },
  minZoom: 0,
  maxZoom: 22,
  attribution: [],
  appearance: "light",
};

const HYBRID_BASEMAP: BasemapDefinition = {
  id: "mixed",
  name: "Mixed",
  source: {
    kind: "hybrid",
    tileUrl: "https://imagery.example.net/{z}/{y}/{x}",
    tileSize: 256,
    maxTileZoom: 17,
    labelStyleUrl: "https://labels.example.net/style.json",
    labelSourceLayers: ["place"],
  },
  minZoom: 0,
  maxZoom: 19,
  attribution: [],
  appearance: "light",
};

const TILE_LAYER: TileLayerDefinition = {
  id: "overlay",
  name: "Overlay",
  description: "A tile overlay.",
  group: "Example",
  dataCost: "some",
  attribution: [],
  controls: [],
  source: {
    kind: "tiles",
    tiles: "https://overlay.example.net/wms?BBOX={bbox-epsg-3857}",
    tileSize: 256,
    maxzoom: 10,
  },
  identify: {
    url: "https://identify.example.net/query?x={lng}&y={lat}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    card: { title: "{title}", lines: [] },
  },
};

const QUERY_LAYER: HeatmapLayerDefinition = {
  id: "density",
  name: "Density",
  description: "A heatmap from a query.",
  group: "Example",
  dataCost: "some",
  attribution: [],
  controls: [],
  source: {
    kind: "query",
    url: "https://query.example.net/points?bbox={west},{south},{east},{north}&limit={limit}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    maxFeatures: 100,
  },
  heatmap: {
    radius: 20,
    intensity: 1,
    ramp: ["vermillion", "vermillion", "vermillion"],
    words: ["Sparse", "Moderate", "Dense"],
  },
  emptyText: "None.",
};

const DETAIL_LAYER: FeedLayerDefinition = {
  ...CAIRNS_LAYER,
  id: "with-detail",
  detail: {
    urlField: "url",
    origins: ["https://detail.example.net"],
    decoder: "geojson",
    colour: "vermillion",
    label: "Detail",
    dataCost: "some",
  },
};

describe("buildContentSecurityPolicy", () => {
  it("allows a raster basemap's tile origin to load images and to be fetched", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [RASTER_BASEMAP],
      layers: [],
    });
    expect(sources(policy, "img-src")).toContain("https://tiles.example.net");
    expect(sources(policy, "connect-src")).toContain(
      "https://tiles.example.net",
    );
  });

  it("allows a vector basemap's style origin in connect-src and img-src, as the reference host does", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [VECTOR_BASEMAP],
      layers: [],
    });
    expect(sources(policy, "connect-src")).toContain(
      "https://styles.example.net",
    );
    expect(sources(policy, "img-src")).toContain("https://styles.example.net");
  });

  it("covers a hybrid basemap's imagery and its label style in both directives", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [HYBRID_BASEMAP],
      layers: [],
    });
    const both = ["https://imagery.example.net", "https://labels.example.net"];
    expect(sources(policy, "img-src")).toEqual(expect.arrayContaining(both));
    expect(sources(policy, "connect-src")).toEqual(
      expect.arrayContaining(both),
    );
  });

  it("builds the origins of the SDK's basemaps, and no others", () => {
    const origins = [
      "https://tiles.openfreemap.org",
      "https://tiles.versatiles.org",
      "https://tile.openstreetmap.org",
    ];
    const policy = buildContentSecurityPolicy({
      basemaps: BASEMAPS,
      layers: [],
    });
    expect(sources(policy, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      ...origins,
    ]);
    expect(sources(policy, "connect-src")).toEqual(["'self'", ...origins]);
  });

  it("matches the origins the reference host's policy allows for the basemaps it offers", () => {
    // The reference host offers every SDK basemap but Colorful, whose
    // VersaTiles origin its policy leaves out (securityHeaders.test.ts in
    // packages/web). Its policy lists these two for the other basemaps, in
    // both directives (builtInBasemaps.test.ts).
    const offered = BASEMAPS.filter((basemap) => basemap.id !== "colorful");
    const policy = buildContentSecurityPolicy({
      basemaps: offered,
      layers: [],
    });
    const reference = [
      "https://tiles.openfreemap.org",
      "https://tile.openstreetmap.org",
    ];
    expect(sources(policy, "img-src").slice(3)).toEqual(reference);
    expect(sources(policy, "connect-src").slice(1)).toEqual(reference);
  });

  it("allows a feed layer's feed and detail origins in connect-src only", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [],
      layers: [DETAIL_LAYER],
    });
    expect(sources(policy, "connect-src")).toEqual(
      expect.arrayContaining([
        "https://example.org",
        "https://detail.example.net",
      ]),
    );
    expect(sources(policy, "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("allows a query layer's origin", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [],
      layers: [QUERY_LAYER],
    });
    expect(sources(policy, "connect-src")).toContain(
      "https://query.example.net",
    );
    expect(sources(policy, "img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("allows a tile layer's tiles and its identify origin", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [],
      layers: [TILE_LAYER],
    });
    expect(sources(policy, "img-src")).toContain("https://overlay.example.net");
    expect(sources(policy, "connect-src")).toEqual(
      expect.arrayContaining([
        "https://overlay.example.net",
        "https://identify.example.net",
      ]),
    );
  });

  it("adds the origins a host names itself, once each", () => {
    const policy = buildContentSecurityPolicy({
      basemaps: [RASTER_BASEMAP, RASTER_BASEMAP],
      layers: [],
      connectOrigins: [
        "https://search.example.net",
        "https://tiles.example.net",
      ],
    });
    expect(sources(policy, "connect-src")).toEqual([
      "'self'",
      "https://tiles.example.net",
      "https://search.example.net",
    ]);
    expect(sources(policy, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://tiles.example.net",
    ]);
  });

  it("keeps the fixed directives and allows nothing the definitions do not name", () => {
    const policy = buildContentSecurityPolicy({ basemaps: [], layers: [] });
    expect(sources(policy, "default-src")).toEqual(["'self'"]);
    expect(sources(policy, "script-src")).toEqual(["'self'"]);
    expect(sources(policy, "style-src")).toEqual(["'self'"]);
    expect(sources(policy, "font-src")).toEqual(["'self'"]);
    expect(sources(policy, "img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(sources(policy, "connect-src")).toEqual(["'self'"]);
    expect(sources(policy, "worker-src")).toEqual(["'self'", "blob:"]);
    expect(sources(policy, "base-uri")).toEqual(["'self'"]);
    for (const closed of [
      "frame-src",
      "object-src",
      "form-action",
      "frame-ancestors",
    ]) {
      expect(sources(policy, closed)).toEqual(["'none'"]);
    }
    expect(policy).not.toContain("unsafe-inline");
  });

  it("adds the script sources a host's inline scripts need", () => {
    const hash = "'sha256-abc='";
    const policy = buildContentSecurityPolicy({
      basemaps: [],
      layers: [],
      scriptSources: [hash],
    });
    expect(sources(policy, "script-src")).toEqual(["'self'", hash]);
  });

  it("refuses a detail origin or a host origin that is not a bare https origin", () => {
    const bad = [
      "https://detail.example.net/path",
      "https://detail.example.net/",
      "https://*.example.net",
      "http://detail.example.net",
      "detail.example.net",
    ];
    for (const origin of bad) {
      expect(() =>
        buildContentSecurityPolicy({
          basemaps: [],
          layers: [],
          connectOrigins: [origin],
        }),
      ).toThrow(/bare https origin/);
      expect(() =>
        buildContentSecurityPolicy({
          basemaps: [],
          layers: [
            {
              ...DETAIL_LAYER,
              detail: { ...DETAIL_LAYER.detail, origins: [origin] },
            } as FeedLayerDefinition,
          ],
        }),
      ).toThrow(/with-detail.*bare https origin/);
    }
  });

  it("refuses a definition URL on plain http", () => {
    const insecure: BasemapDefinition = {
      ...RASTER_BASEMAP,
      source: {
        kind: "raster",
        tileUrl: "http://tiles.example.net/{z}/{x}/{y}.png",
        tileSize: 256,
      },
    };
    expect(() =>
      buildContentSecurityPolicy({ basemaps: [insecure], layers: [] }),
    ).toThrow(/basemap plain.*not an https URL/);
  });

  it("names the definition whose URL has a placeholder in its host", () => {
    const subdomains: BasemapDefinition = {
      ...RASTER_BASEMAP,
      id: "shards",
      source: {
        kind: "raster",
        tileUrl: "https://{s}.tiles.example.net/{z}/{x}/{y}.png",
        tileSize: 256,
      },
    };
    expect(() =>
      buildContentSecurityPolicy({ basemaps: [subdomains], layers: [] }),
    ).toThrow(/basemap shards: cannot read an origin/);
  });

  it("refuses a script source that would end the directive or split the source", () => {
    for (const source of ["'self'; img-src *", "'a' 'b'", "'a',", "a\tb"]) {
      expect(() =>
        buildContentSecurityPolicy({
          basemaps: [],
          layers: [],
          scriptSources: [source],
        }),
      ).toThrow(/script source/);
    }
  });
});
