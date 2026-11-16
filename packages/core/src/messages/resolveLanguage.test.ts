// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { resolveLanguage } from "./resolveLanguage";

const OFFERED = ["en-GB", "af"];

describe("resolveLanguage", () => {
  it("returns an offered choice, whatever the browser asks for", () => {
    expect(resolveLanguage("af", OFFERED, ["en-GB"], "en-GB")).toBe("af");
    expect(resolveLanguage("en-GB", OFFERED, ["af"], "en-GB")).toBe("en-GB");
  });

  it("matches a choice without regard to case, returning the offered spelling", () => {
    expect(resolveLanguage("EN-gb", OFFERED, [], "af")).toBe("en-GB");
  });

  it("ignores a choice the host does not offer and follows the browser", () => {
    expect(resolveLanguage("fr", OFFERED, ["af"], "en-GB")).toBe("af");
  });

  it("does not match a choice by language subtag alone", () => {
    expect(resolveLanguage("af-ZA", ["af"], [], "en-GB")).toBe("en-GB");
  });

  it("follows the browser when there is no choice, taking the first offered language in its order", () => {
    expect(resolveLanguage(null, OFFERED, ["fr", "af", "en-GB"], "en-GB")).toBe(
      "af",
    );
    expect(resolveLanguage(null, OFFERED, ["en-GB", "af"], "af")).toBe("en-GB");
  });

  it("matches a regional browser tag to an offered language subtag", () => {
    expect(resolveLanguage(null, OFFERED, ["af-ZA"], "en-GB")).toBe("af");
    expect(resolveLanguage(null, OFFERED, ["en-ZA"], "af")).toBe("en-GB");
  });

  it("prefers an exact tag to a subtag match in the same position", () => {
    expect(resolveLanguage(null, ["en-US", "en-GB"], ["en-GB"], "en-US")).toBe(
      "en-GB",
    );
  });

  it("keeps the browser's order over a better match later in the list", () => {
    expect(resolveLanguage(null, OFFERED, ["en-ZA", "af"], "af")).toBe("en-GB");
  });

  it("returns the fallback when nothing is offered or the browser lists none", () => {
    expect(resolveLanguage(null, OFFERED, [], "en-GB")).toBe("en-GB");
    expect(resolveLanguage(null, OFFERED, ["fr", "de-CH"], "en-GB")).toBe(
      "en-GB",
    );
    expect(resolveLanguage(null, [], ["af"], "en-GB")).toBe("en-GB");
  });
});
