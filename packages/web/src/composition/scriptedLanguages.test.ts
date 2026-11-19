// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { languageDirection } from "@mapcairn/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServices } from "./createServices";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  Reflect.deleteProperty(window, "__MAPCAIRN_TEST_LANGUAGES__");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SAMPLE = {
  tag: "en-XB",
  label: "English (mirrored)",
  direction: "rtl",
  messages: { "layers.title": "Data" },
};

describe("the scripted languages in the test seam", () => {
  it("offers the scripted languages after the host's own", async () => {
    window.__MAPCAIRN_TEST_LANGUAGES__ = [SAMPLE];
    const { languages } = createServices();
    expect(languages?.languages.map(({ tag }) => tag)).toEqual([
      "en-GB",
      "af",
      "en-XB",
    ]);
    expect(languages?.defaultLanguage).toBe("en-GB");
    expect(languageDirection("en-XB", languages?.languages)).toBe("rtl");
  });

  it("loads a scripted language over English, and the host's own as before", async () => {
    window.__MAPCAIRN_TEST_LANGUAGES__ = [SAMPLE];
    const { languages } = createServices();
    const scripted = await languages?.load("en-XB");
    expect(scripted?.language).toBe("en-XB");
    expect(scripted?.t("layers.title", {})).toBe("Data");
    expect(scripted?.t("settings.theme.label", {})).toBe("Theme");
    expect((await languages?.load("af"))?.language).toBe("af");
  });

  it("leaves the host's languages alone without a usable script", () => {
    for (const script of [
      undefined,
      "x",
      [],
      [{ tag: 1 }],
      [{ ...SAMPLE, tag: "af" }],
    ]) {
      window.__MAPCAIRN_TEST_LANGUAGES__ = script;
      const { languages } = createServices();
      expect(languages?.languages.map(({ tag }) => tag)).toEqual([
        "en-GB",
        "af",
      ]);
    }
  });

  it("ignores the script in a production build", () => {
    vi.stubEnv("MODE", "production");
    window.__MAPCAIRN_TEST_LANGUAGES__ = [SAMPLE];
    const { languages } = createServices();
    expect(languages?.languages.map(({ tag }) => tag)).toEqual(["en-GB", "af"]);
  });
});
