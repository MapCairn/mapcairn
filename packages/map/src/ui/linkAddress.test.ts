// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { isSitePath, isWebAddress } from "./linkAddress";

describe("isWebAddress", () => {
  it.each(["https://example.org/about", "http://example.org"])(
    "accepts %s",
    (href) => {
      expect(isWebAddress(href)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "mailto:a@example.org",
    "/about",
    "about",
    "",
  ])("refuses %j", (href) => {
    expect(isWebAddress(href)).toBe(false);
  });
});

describe("isSitePath", () => {
  it.each(["/", "/about", "/privacy#top"])("accepts %s", (href) => {
    expect(isSitePath(href)).toBe(true);
  });

  it.each([
    "//example.org",
    "/\\example.org",
    "https://example.org",
    "about",
    "",
  ])("refuses %j", (href) => {
    expect(isSitePath(href)).toBe(false);
  });
});
