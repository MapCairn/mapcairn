// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { UrlStateValue } from "../ports/url";
import { parseUrlHash, serialiseUrlHash } from "./index";

/**
 * Links a person may already have shared, kept as literals. This list only
 * grows: a change to the link format that makes one of these read differently
 * is a breaking change to the public API (`docs/guides/public-api.md`), even
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
  ["#shapes=gAbC.p_-9", { shapes: "gAbC.p_-9" }],
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
