// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";
import { languageDirection } from "./languageDirection";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("languageDirection", () => {
  it("uses the locale's script for the direction", () => {
    expect(languageDirection("en-GB")).toBe("ltr");
    expect(languageDirection("ar")).toBe("rtl");
    expect(languageDirection("az-Arab")).toBe("rtl");
  });

  it("honours a host's explicit direction", () => {
    expect(
      languageDirection("en-GB", [
        { tag: "en-GB", label: "English", direction: "rtl" },
      ]),
    ).toBe("rtl");
    expect(
      languageDirection("ar", [
        { tag: "ar", label: "Arabic", direction: "ltr" },
      ]),
    ).toBe("ltr");
  });

  it("falls back to ltr for an invalid tag or unavailable locale information", () => {
    expect(languageDirection("not a tag")).toBe("ltr");
    vi.stubGlobal("Intl", {});
    expect(languageDirection("ar")).toBe("ltr");
  });

  it("supports the older textInfo property", () => {
    vi.stubGlobal("Intl", {
      Locale: class {
        textInfo = { direction: "rtl" };
      },
    });
    expect(languageDirection("ar")).toBe("rtl");
  });

  it("falls back when text information is missing or has an unknown direction", () => {
    vi.stubGlobal("Intl", { Locale: class {} });
    expect(languageDirection("ar")).toBe("ltr");
    vi.stubGlobal("Intl", {
      Locale: class {
        getTextInfo() {
          return { direction: "unknown" };
        }
      },
    });
    expect(languageDirection("ar")).toBe("ltr");
  });
});
