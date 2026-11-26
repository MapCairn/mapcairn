// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { buildLanguages } from "./languages";
import { MountMapError } from "./MountMapError";

const AFRIKAANS = {
  tag: "af",
  label: "Afrikaans",
  messages: { "chrome.endStack.mapOptions": "Kaartopsies" },
};

function problem(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MountMapError);
    expect((error as MountMapError).kind).toBe("invalid-option");
    return (error as MountMapError).message;
  }
  throw new Error("It did not throw.");
}

describe("buildLanguages", () => {
  it("offers no choice when there are no languages", () => {
    expect(buildLanguages(undefined, undefined)).toEqual({
      catalogue: undefined,
      initial: null,
    });
  });

  it("puts English first and the page's languages after it", () => {
    const { catalogue } = buildLanguages([AFRIKAANS], undefined);
    expect(catalogue?.languages.map(({ tag }) => tag)).toEqual(["en-GB", "af"]);
    expect(catalogue?.languages[0]?.label).toBe("English");
    expect(catalogue?.defaultLanguage).toBe("en-GB");
  });

  it("loads a language over English, so a key it lacks reads in English", async () => {
    const { catalogue } = buildLanguages([AFRIKAANS], undefined);
    const messages = await catalogue?.load("af");
    expect(messages?.language).toBe("af");
    expect(messages?.t("chrome.endStack.mapOptions", {})).toBe("Kaartopsies");
    expect(messages?.t("chrome.sheet.close", {})).toBe("Close");
  });

  it("loads English as it is", async () => {
    const { catalogue } = buildLanguages([AFRIKAANS], undefined);
    expect((await catalogue?.load("en-GB"))?.t("chrome.sheet.close", {})).toBe(
      "Close",
    );
  });

  it("has no messages for a tag it does not offer", () => {
    const { catalogue } = buildLanguages([AFRIKAANS], undefined);
    expect(() => catalogue?.load("fr")).toThrow(
      'The language "fr" is not offered.',
    );
  });

  it("carries a direction", () => {
    const { catalogue } = buildLanguages(
      [{ tag: "ar", label: "العربية", direction: "rtl", messages: {} }],
      undefined,
    );
    expect(catalogue?.languages[1]?.direction).toBe("rtl");
  });

  it("starts on the language named, and follows the browser when none is", () => {
    expect(buildLanguages([AFRIKAANS], "af").initial).toBe("af");
    expect(buildLanguages([AFRIKAANS], "en-GB").initial).toBe("en-GB");
    expect(buildLanguages([AFRIKAANS], undefined).initial).toBeNull();
  });

  it("names the fix for a language that is not offered", () => {
    expect(problem(() => buildLanguages([AFRIKAANS], "fr"))).toBe(
      'language "fr" is not offered. Use one of: en-GB, af, or add it to languages.',
    );
    expect(problem(() => buildLanguages(undefined, "af"))).toBe(
      'language "af" is not offered. Use one of: en-GB, or add it to languages.',
    );
  });

  it("refuses what is not a list of languages", () => {
    expect(problem(() => buildLanguages("af", undefined))).toBe(
      'languages must be a list, such as [{ tag: "af", label: "Afrikaans", messages: {} }].',
    );
    expect(problem(() => buildLanguages([null], undefined))).toBe(
      "languages[0] must be an object with a tag, a label and messages.",
    );
  });

  it("refuses a tag that is not a tag, a label that is not text and a direction that is neither", () => {
    expect(
      problem(() => buildLanguages([{ ...AFRIKAANS, tag: "" }], undefined)),
    ).toBe('languages[0].tag must be a language tag such as "af".');
    expect(
      problem(() =>
        buildLanguages([{ ...AFRIKAANS, tag: "not a tag" }], undefined),
      ),
    ).toBe('languages[0].tag must be a language tag such as "af".');
    expect(
      problem(() => buildLanguages([{ ...AFRIKAANS, label: "" }], undefined)),
    ).toBe("languages[0].label must be the language's name, in that language.");
    expect(
      problem(() =>
        buildLanguages([{ ...AFRIKAANS, direction: "up" as never }], undefined),
      ),
    ).toBe('languages[0].direction must be "ltr" or "rtl".');
  });

  it("refuses messages that are not messages, a key that is not a key and a value that is not text", () => {
    expect(
      problem(() =>
        buildLanguages([{ ...AFRIKAANS, messages: null as never }], undefined),
      ),
    ).toBe("languages[0].messages must be an object of message keys and text.");
    expect(
      problem(() =>
        buildLanguages(
          [{ ...AFRIKAANS, messages: { nope: "x" } as never }],
          undefined,
        ),
      ),
    ).toBe('languages[0].messages: "nope" is not a message key.');
    expect(
      problem(() =>
        buildLanguages(
          [{ ...AFRIKAANS, messages: { "chrome.sheet.close": 3 } as never }],
          undefined,
        ),
      ),
    ).toBe('languages[0].messages: "chrome.sheet.close" must be text.');
  });

  it("refuses a tag used twice, English included", () => {
    expect(
      problem(() => buildLanguages([AFRIKAANS, AFRIKAANS], undefined)),
    ).toBe(
      'languages: the tag "af" is used twice. Give each language its own tag.',
    );
    expect(
      problem(() =>
        buildLanguages([{ ...AFRIKAANS, tag: "en-GB" }], undefined),
      ),
    ).toBe(
      'languages: the tag "en-GB" is used twice. Give each language its own tag. English (en-GB) is always offered, so leave it out.',
    );
  });
});
