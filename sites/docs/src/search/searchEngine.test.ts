// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { SearchRecord } from "../../scripts/searchRecords";
import { createSearch, excerptSegments, tokenize } from "./searchEngine";

function record(
  url: string,
  page: string,
  heading: string,
  text: string,
): SearchRecord {
  return { id: url, url, page, heading, text };
}

const RECORDS: SearchRecord[] = [
  record(
    "/docs/",
    "Get started",
    "",
    "Install the SDK and draw a map with the MapView component.",
  ),
  record("/docs/#install", "Get started", "Install", "npm install the SDK."),
  record(
    "/docs/api/map-view/",
    "MapView",
    "",
    "The component that hosts the map.",
  ),
  record(
    "/docs/api/map-view/#props",
    "MapView",
    "Props",
    "Options for MapView such as basemap and onReady.",
  ),
  record(
    "/docs/themes/",
    "Theme",
    "Colour tokens",
    "A map view can follow the system theme.",
  ),
];

describe("tokenize", () => {
  it("lowercases, splits on punctuation and keeps whole identifiers", () => {
    expect(tokenize("MapView, on-ready")).toEqual(
      expect.arrayContaining(["mapview", "map", "view", "on", "ready"]),
    );
  });

  it("keeps a scoped package name findable by its parts", () => {
    expect(tokenize("@mapcairn/sdk")).toEqual(
      expect.arrayContaining(["mapcairn", "sdk"]),
    );
  });
});

describe("createSearch", () => {
  const search = createSearch(RECORDS);

  it("returns nothing for an empty or blank query", () => {
    expect(search("")).toEqual([]);
    expect(search("   ")).toEqual([]);
  });

  it("returns nothing when no section matches", () => {
    expect(search("zzzzqqq")).toEqual([]);
  });

  it("puts an exact name first: the page titled MapView beats prose that mentions it", () => {
    expect(search("MapView")[0]?.url).toBe("/docs/api/map-view/");
  });

  it("puts an exact heading ahead of sections that only mention the word", () => {
    expect(search("props")[0]?.url).toBe("/docs/api/map-view/#props");
  });

  it("matches a prefix as the person types", () => {
    expect(search("basem").map((result) => result.url)).toContain(
      "/docs/api/map-view/#props",
    );
  });

  it("finds a word in body text", () => {
    expect(search("system theme").map((result) => result.url)).toContain(
      "/docs/themes/",
    );
  });

  it("treats the last term as a prefix while typing", () => {
    expect(search("install th").map((r) => r.url)).toContain("/docs/#install");
  });

  it("caps the number of results", () => {
    expect(search("the", 2)).toHaveLength(2);
  });
});

describe("excerptSegments", () => {
  it("marks the matching words in a window around the first match", () => {
    const text = `${"filler ".repeat(40)}the MapView component hosts the map ${"more ".repeat(40)}`;
    const segments = excerptSegments(text, ["mapview"], 80);
    expect(segments.some((s) => s.match && s.text === "MapView")).toBe(true);
    expect(segments.map((s) => s.text).join("").length).toBeLessThanOrEqual(90);
    expect(segments[0]?.text.startsWith("…")).toBe(true);
  });

  it("starts at the beginning, with no leading ellipsis, when the match is early", () => {
    const segments = excerptSegments("MapView first, then a long tail.", [
      "mapview",
    ]);
    expect(segments[0]).toEqual({ text: "MapView", match: true });
  });

  it("does not mark a term inside a longer word", () => {
    const segments = excerptSegments("a bitmap and a map", ["map"]);
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(["map"]);
  });

  it("returns the start of the text when nothing matches", () => {
    const segments = excerptSegments("Plain text here.", ["zzz"]);
    expect(segments).toEqual([{ text: "Plain text here.", match: false }]);
  });
});
