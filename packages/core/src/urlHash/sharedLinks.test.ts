// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { decodeShapes } from "../draw/share";
import type { UrlStateValue } from "../ports/url";
import { parseUrlHash, serialiseUrlHash } from "./index";

/**
 * Links a person may already have shared, kept as literals. This list only
 * grows: a change to the link format that makes one of these read differently
 * is a breaking change to the public API (`sites/docs/docs/guides/public-api.md`), even
 * when no type changes. Remove an entry only in a release that says so.
 */
const SHARED_LINKS: ReadonlyArray<readonly [string, UrlStateValue]> = [
  [
    "#map=12.35/-26.20410/28.04730&basemap=osm-liberty",
    {
      view: {
        center: { lat: -26.2041, lng: 28.0473 },
        zoom: 12.35,
        bearing: 0,
      },
      basemapId: "osm-liberty",
    },
  ],
  [
    "#map=3.00/1.00000/2.00000/90",
    { view: { center: { lat: 1, lng: 2 }, zoom: 3, bearing: 90 } },
  ],
  ["map=5/0/0", { view: { center: { lat: 0, lng: 0 }, zoom: 5, bearing: 0 } }],
  ["#basemap=some-basemap", { basemapId: "some-basemap" }],
  [
    "#layers=a,b&a.mode=dots&b.range=7d",
    {
      layers: {
        enabled: ["a", "b"],
        controls: { a: { mode: "dots" }, b: { range: "7d" } },
      },
    },
  ],
  [
    "#map=5/0/0&shapes=pg3v4Hvp2jO",
    {
      view: { center: { lat: 0, lng: 0 }, zoom: 5, bearing: 0 },
      shapes: "pg3v4Hvp2jO",
    },
  ],
];

describe("links people have already shared", () => {
  it.each(SHARED_LINKS)("still reads %s", (link, expected) => {
    expect(parseUrlHash(link)).toEqual(expected);
  });

  it.each(SHARED_LINKS)(
    "writes what it read from %s as a link that reads the same",
    (link) => {
      const read = parseUrlHash(link);
      expect(parseUrlHash(serialiseUrlHash(read))).toEqual(read);
    },
  );
});

/**
 * Output of `encodeShapes`, written once from the code as it stood and kept
 * as literals, with what `decodeShapes` must still return for it. A change to
 * the shape encoding that breaks one of these breaks links already shared.
 */
const SHARED_SHAPES: ReadonlyArray<readonly [string, string, unknown]> = [
  [
    "point",
    "pg3v4Hvp2jO",
    [{ kind: "point", vertices: [{ lat: 40.7128, lng: -74.006 }] }],
  ],
  [
    "line",
    "lggs6Jv9Yw-Bw-Bv-Bw-B",
    [
      {
        kind: "line",
        vertices: [
          { lat: 51.5072, lng: -0.1276 },
          { lat: 51.5172, lng: -0.1176 },
          { lat: 51.5072, lng: -0.1076 },
        ],
      },
    ],
  ],
  [
    "polygon",
    "g4pmqJotrOAw-Bw-Bnf",
    [
      {
        kind: "polygon",
        vertices: [
          { lat: 48.8566, lng: 2.3522 },
          { lat: 48.8566, lng: 2.3622 },
          { lat: 48.8666, lng: 2.3572 },
        ],
      },
    ],
  ],
  [
    "circle",
    "czr8H843gH8uB",
    [
      {
        kind: "circle",
        vertices: [{ lat: -1.2921, lng: 36.8219 }],
        radiusMetres: 750,
      },
    ],
  ],
];

describe("shapes in links people have already shared", () => {
  it.each(SHARED_SHAPES)("still decodes a %s", (_kind, text, expected) => {
    expect(decodeShapes(text)).toEqual(expected);
  });

  it("still decodes several shapes in one link", () => {
    const text = SHARED_SHAPES.map(([, part]) => part).join(".");
    expect(decodeShapes(text)).toEqual(
      SHARED_SHAPES.flatMap(([, , shapes]) => shapes as unknown[]),
    );
  });
});
