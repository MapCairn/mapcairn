// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { contentTypeOf, resolveTarget } from "./serveBuild";

const files = new Set([
  "index.html",
  "404.html",
  "guides/embed-a-map/index.html",
  "assets/fonts/plex.woff2",
  "llms.txt",
]);
const directories = new Set(["guides", "guides/embed-a-map", "assets"]);

function kindOf(path: string): "file" | "directory" | "none" {
  if (files.has(path)) {
    return "file";
  }
  return directories.has(path) ? "directory" : "none";
}

describe("resolveTarget", () => {
  it("serves the index of the base path", () => {
    expect(resolveTarget("/docs/", kindOf)).toEqual({
      kind: "file",
      path: "index.html",
    });
  });

  it("serves the index of a folder given with a trailing slash", () => {
    expect(resolveTarget("/docs/guides/embed-a-map/", kindOf)).toEqual({
      kind: "file",
      path: "guides/embed-a-map/index.html",
    });
  });

  it("redirects a folder given without its trailing slash", () => {
    expect(resolveTarget("/docs/guides/embed-a-map", kindOf)).toEqual({
      kind: "redirect",
      location: "/docs/guides/embed-a-map/",
    });
  });

  it("serves a file whose name has an extension as it is, with no slash added", () => {
    expect(resolveTarget("/docs/assets/fonts/plex.woff2", kindOf)).toEqual({
      kind: "file",
      path: "assets/fonts/plex.woff2",
    });
  });

  it("answers an unknown address, or one outside the base path, with the 404 page", () => {
    expect(resolveTarget("/docs/nope/", kindOf)).toEqual({
      kind: "missing",
      path: "404.html",
    });
    expect(resolveTarget("/elsewhere", kindOf)).toEqual({
      kind: "missing",
      path: "404.html",
    });
  });

  it("refuses a path that climbs out of the build folder", () => {
    expect(resolveTarget("/docs/../package.json", kindOf)).toEqual({
      kind: "missing",
      path: "404.html",
    });
  });
});

describe("contentTypeOf", () => {
  it("names the types the build holds and falls back to binary", () => {
    expect(contentTypeOf("a/index.html")).toBe("text/html; charset=utf-8");
    expect(contentTypeOf("x.woff2")).toBe("font/woff2");
    expect(contentTypeOf("x.unknown")).toBe("application/octet-stream");
  });
});
