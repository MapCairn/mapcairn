// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import type { LayerFeature } from "../ports/layers";
import {
  canSaveFeatures,
  creditLines,
  featuresToCsv,
  featuresToGeoJsonText,
  MAX_SAVED_FEATURES,
  savedFeatureSet,
  savedFileName,
} from "./saveFeatures";

const INFO = {
  layerName: "Sample points",
  credits: ["Sample provider (https://sample.test/)"],
  savedOn: "2026-11-25",
};

function point(
  id: string,
  fields: LayerFeature["fields"],
  coordinates: readonly [number, number] = [18.4, -33.9],
): LayerFeature {
  return { id, geometry: { type: "Point", coordinates }, fields };
}

describe("canSaveFeatures", () => {
  it("is false for a feed or query layer that does not say saving is allowed", () => {
    expect(canSaveFeatures(SAMPLE_FEED_LAYER)).toBe(false);
    expect(canSaveFeatures(SAMPLE_QUERY_LAYER)).toBe(false);
    expect(canSaveFeatures({ ...SAMPLE_FEED_LAYER, saveFeatures: false })).toBe(
      false,
    );
  });

  it("is true for a feed or query layer that allows it", () => {
    expect(canSaveFeatures({ ...SAMPLE_FEED_LAYER, saveFeatures: true })).toBe(
      true,
    );
    expect(canSaveFeatures({ ...SAMPLE_QUERY_LAYER, saveFeatures: true })).toBe(
      true,
    );
  });

  it("is false for every other kind of layer, whatever the field says", () => {
    for (const layer of [
      SAMPLE_TILE_LAYER,
      SAMPLE_VECTOR_LAYER,
      SAMPLE_IDENTIFY_LAYER,
      SAMPLE_HEATMAP_LAYER,
    ]) {
      expect(canSaveFeatures({ ...layer, saveFeatures: true } as never)).toBe(
        false,
      );
    }
  });
});

describe("savedFeatureSet", () => {
  it("keeps every feature under the cap", () => {
    const features = [point("a", {}), point("b", {})];
    expect(savedFeatureSet(features)).toEqual({
      kept: features,
      total: 2,
      capped: false,
    });
  });

  it("is not capped at exactly the cap, and is at one more", () => {
    const make = (count: number) =>
      Array.from({ length: count }, (_, i) => point(String(i), {}));
    expect(savedFeatureSet(make(MAX_SAVED_FEATURES))).toMatchObject({
      total: MAX_SAVED_FEATURES,
      capped: false,
    });
    expect(savedFeatureSet(make(MAX_SAVED_FEATURES)).kept).toHaveLength(
      MAX_SAVED_FEATURES,
    );
    const over = savedFeatureSet(make(MAX_SAVED_FEATURES + 1));
    expect(over.kept).toHaveLength(MAX_SAVED_FEATURES);
    expect(over).toMatchObject({ total: MAX_SAVED_FEATURES + 1, capped: true });
  });

  it("keeps the first features up to the cap and says it cut", () => {
    const features = Array.from({ length: MAX_SAVED_FEATURES + 3 }, (_, i) =>
      point(String(i), {}),
    );
    const set = savedFeatureSet(features);
    expect(set.kept).toHaveLength(MAX_SAVED_FEATURES);
    expect(set.kept[0]?.id).toBe("0");
    expect(set).toMatchObject({ total: MAX_SAVED_FEATURES + 3, capped: true });
  });
});

describe("creditLines and savedFileName", () => {
  it("writes each credit with its link and the year filled in", () => {
    expect(
      creditLines(
        [
          { text: "(c) {year} Provider", url: "https://p.test/terms" },
          { text: "Plain" },
        ],
        "2026",
      ),
    ).toEqual(["(c) 2026 Provider (https://p.test/terms)", "Plain"]);
  });

  it("names the file after the layer id and the date", () => {
    expect(savedFileName("sample-points", "2026-11-25", "geojson")).toBe(
      "sample-points-2026-11-25.geojson",
    );
    expect(savedFileName("sample-points", "2026-11-25", "csv")).toBe(
      "sample-points-2026-11-25.csv",
    );
  });
});

describe("featuresToGeoJsonText", () => {
  it("writes a feature collection that carries the layer, the credit and the date", () => {
    const text = featuresToGeoJsonText(
      [point("a", { title: "Alpha", size: 3, ok: true, none: null })],
      INFO,
    );
    expect(JSON.parse(text)).toEqual({
      type: "FeatureCollection",
      layer: "Sample points",
      attribution: INFO.credits,
      saved: "2026-11-25",
      features: [
        {
          type: "Feature",
          id: "a",
          geometry: { type: "Point", coordinates: [18.4, -33.9] },
          properties: { title: "Alpha", size: 3, ok: true, none: null },
        },
      ],
    });
  });

  it("writes numbers as plain decimal text, never with an exponent", () => {
    const text = featuresToGeoJsonText(
      [point("a", { tiny: 7.8e-7, huge: 1e21 }, [1e-7, 2])],
      INFO,
    );
    expect(text).not.toMatch(/\de[+-]?\d/i);
    expect(text).toContain("0.00000078");
    expect(text).toContain("0.0000001");
    expect(text).toContain("1000000000000000000000");
  });

  it("keeps markup in a property as inert text", () => {
    const text = featuresToGeoJsonText(
      [point("a", { title: '<img src=x onerror="alert(1)">' })],
      INFO,
    );
    expect(JSON.parse(text).features[0].properties.title).toBe(
      '<img src=x onerror="alert(1)">',
    );
  });

  it("writes polygons and lines as they are", () => {
    const polygon: LayerFeature = {
      id: "p",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      fields: {},
    };
    expect(
      JSON.parse(featuresToGeoJsonText([polygon], INFO)).features[0].geometry,
    ).toEqual(polygon.geometry);
  });

  it("writes an empty collection for no features", () => {
    expect(JSON.parse(featuresToGeoJsonText([], INFO)).features).toEqual([]);
  });
});

describe("featuresToCsv", () => {
  const lines = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n");

  it("writes a header, a row for each feature and the credit in each row", () => {
    const csv = featuresToCsv(
      [
        point("a", { title: "Alpha", size: 3 }),
        point("b", { title: "Beta", size: 4.5 }),
      ],
      INFO,
    );
    expect(lines(csv)).toEqual([
      "feature_id,longitude,latitude,geometry,title,size,credit,saved",
      'a,18.4,-33.9,"{""type"":""Point"",""coordinates"":[18.4,-33.9]}",Alpha,3,Sample provider (https://sample.test/),2026-11-25',
      'b,18.4,-33.9,"{""type"":""Point"",""coordinates"":[18.4,-33.9]}",Beta,4.5,Sample provider (https://sample.test/),2026-11-25',
    ]);
  });

  it("joins several credits in one cell, quoted where it needs it", () => {
    const csv = featuresToCsv([point("a", {})], {
      ...INFO,
      credits: ["One, Inc", "Two"],
    });
    expect(lines(csv)[1]).toContain('"One, Inc; Two"');
  });

  it("leaves the position empty for a shape and writes its geometry", () => {
    const line: LayerFeature = {
      id: "l",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      fields: {},
    };
    const row = lines(featuresToCsv([line], INFO))[1];
    expect(row).toMatch(/^l,,,"\{""type"":""LineString""/);
  });

  it("uses the union of fields as columns, with an empty cell where a feature lacks one", () => {
    const csv = featuresToCsv(
      [point("a", { title: "A" }), point("b", { place: "B" })],
      INFO,
    );
    expect(lines(csv)[0]).toContain(",title,place,");
    expect(lines(csv)[1]).toMatch(/,A,,Sample/);
    expect(lines(csv)[2]).toMatch(/,,B,Sample/);
  });

  it("writes numbers as plain decimal text and booleans and nulls plainly", () => {
    const csv = featuresToCsv(
      [point("a", { tiny: 7.8e-7, neg: -5, ok: false, none: null })],
      INFO,
    );
    const row = lines(csv)[1] ?? "";
    expect(row).toContain(",0.00000078,-5,false,,");
    expect(row).not.toMatch(/\de-/);
  });

  it("leaves a number that is not finite empty", () => {
    const csv = featuresToCsv([point("a", { bad: Number.NaN })], INFO);
    expect(lines(csv)[1]).toContain(",,Sample provider");
  });

  it("quotes a cell with a comma, a quote or a line break", () => {
    const csv = featuresToCsv(
      [point("a", { title: 'one, "two"\nthree' })],
      INFO,
    );
    expect(csv).toContain('"one, ""two""\nthree"');
  });

  it.each([
    "=SUM(A1)",
    "+1+1",
    "-2+3",
    "@cmd",
    "\tx",
    "\rx",
    "\n=1",
    " =1",
    "  \t+1",
    "'=1",
    "-5",
    "+27 82 000 0000",
  ])(
    "neutralises a text cell that starts with %j so a spreadsheet does not run it",
    (value) => {
      const csv = featuresToCsv([point("a", { title: value })], INFO);
      expect(csv).toContain(`'${value}`);
    },
  );

  it("neutralises a feature id and a field name that start with a formula character", () => {
    const csv = featuresToCsv([point("=1+1", { "@x": "y" })], INFO);
    const [header, row] = lines(csv);
    expect(header).toContain(",'@x,");
    expect(row?.startsWith("'=1+1,")).toBe(true);
  });

  it("does not touch a negative number, which is a number and not text", () => {
    const csv = featuresToCsv([point("a", { depth: -12.5 })], INFO);
    expect(lines(csv)[1]).toContain(",-12.5,");
  });

  it("keeps a field named like a built-in column from clashing with it", () => {
    const header = lines(
      featuresToCsv([point("a", { feature_id: "x", credit: "y" })], INFO),
    )[0];
    const names = (header ?? "").split(",");
    expect(new Set(names).size).toBe(names.length);
  });

  it("starts with a byte order mark so Excel reads UTF-8", () => {
    expect(
      featuresToCsv([point("a", { title: "Kaapstad Môre" })], INFO),
    ).toMatch(/^\uFEFFfeature_id,/);
  });

  it("writes a point's position and geometry with no exponent", () => {
    const row = lines(featuresToCsv([point("a", {}, [1e-7, 2])], INFO))[1];
    expect(row).toMatch(/^a,0\.0000001,2,/);
    expect(row).toContain("[0.0000001,2]");
    expect(row).not.toMatch(/\de-/);
  });

  it("neutralises a formula that follows a quote", () => {
    expect(featuresToCsv([point("a", { title: '"@x' })], INFO)).toContain(
      `"'""@x"`,
    );
  });

  it("quotes a cell with a carriage return after neutralising it", () => {
    expect(featuresToCsv([point("a", { title: "\rx" })], INFO)).toContain(
      '"\'\rx"',
    );
  });

  it("numbers a renamed field from 2, whichever column it clashes with", () => {
    const header = lines(
      featuresToCsv([point("a", { feature_id: "x", credit: "y" })], INFO),
    )[0];
    expect(header).toBe(
      "feature_id,longitude,latitude,geometry,feature_id_2,credit_2,credit,saved",
    );
  });

  it("leaves a geometry longer than a spreadsheet cell out of the row", () => {
    const coordinates = Array.from(
      { length: 4000 },
      (_, i) => [i / 1000, i / 1000] as const,
    );
    const long: LayerFeature = {
      id: "l",
      geometry: { type: "LineString", coordinates },
      fields: { title: "Long" },
    };
    const row = lines(featuresToCsv([long], INFO))[1];
    expect(row).toMatch(/^l,,,,Long,/);
    expect(
      JSON.parse(featuresToGeoJsonText([long], INFO)).features[0].geometry
        .coordinates,
    ).toHaveLength(4000);
  });

  it("writes only the header for no features", () => {
    expect(lines(featuresToCsv([], INFO))).toEqual([
      "feature_id,longitude,latitude,geometry,credit,saved",
    ]);
  });
});
