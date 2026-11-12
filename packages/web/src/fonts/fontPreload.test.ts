// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { fontPreloadLinks } from "./fontPreload";

describe("fontPreloadLinks", () => {
  it("preloads only the Latin variable face, as an anonymous-CORS woff2", () => {
    expect(fontPreloadLinks).toHaveLength(1);
    const [link] = fontPreloadLinks;
    expect(link).toMatchObject({
      rel: "preload",
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    });
    expect(link?.href).toMatch(/ibm-plex-sans-latin-wght-normal.*\.woff2/);
  });
});
