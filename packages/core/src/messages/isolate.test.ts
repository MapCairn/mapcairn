// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { isolate } from "./isolate";

const FSI = "\u2068";
const PDI = "\u2069";

describe("isolate", () => {
  it("wraps text in a first-strong isolate and its terminator", () => {
    expect(isolate("-26.2, 28.0")).toBe(`${FSI}-26.2, 28.0${PDI}`);
  });

  it("leaves empty text alone", () => {
    expect(isolate("")).toBe("");
  });

  it("removes isolate controls the text already holds, so it cannot end its own isolation", () => {
    expect(isolate(`a${PDI}b\u2066c\u2067d${FSI}e`)).toBe(`${FSI}abcde${PDI}`);
  });

  it("does not wrap a value twice", () => {
    expect(isolate(isolate("Cairo"))).toBe(`${FSI}Cairo${PDI}`);
  });

  it("returns empty text for a value of only controls", () => {
    expect(isolate(`${FSI}${PDI}`)).toBe("");
  });
});
