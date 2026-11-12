// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import { describe, expect, it, vi } from "vitest";
import {
  checkFontGate,
  type FontGateDeps,
  fontFamilies,
  MIN_WIDTH_DIFFERENCE_PX,
} from "./fontGate";

const { primary, fallback } = fontFamilies();

/** A font set and canvas measure scripted to a loaded or missing font. */
function deps({
  checks = true,
  plexWidth = 600,
  fallbackWidth = 560,
  loadFails = false,
}: {
  checks?: boolean;
  plexWidth?: number | null;
  fallbackWidth?: number;
  loadFails?: boolean;
} = {}): FontGateDeps & {
  load: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
} {
  const load = vi.fn(() =>
    loadFails ? Promise.reject(new Error("network")) : Promise.resolve([]),
  );
  const check = vi.fn(() => checks);
  return {
    load,
    check,
    fonts: { load, check, ready: Promise.resolve() },
    measure: (font) =>
      font.includes(primary) ? (plexWidth ?? undefined) : fallbackWidth,
  };
}

describe("fontFamilies", () => {
  it("reads the face and its fallback from the token font stack", () => {
    expect(tokenValues.fontFamily.startsWith(primary)).toBe(true);
    expect(primary).toContain("IBM Plex Sans");
    expect(fallback).toContain("Fallback");
  });
});

describe("checkFontGate", () => {
  it("passes when both weights load and the text measures differently from the fallback", async () => {
    const scripted = deps();
    const result = await checkFontGate(scripted);
    expect(result.loaded).toBe(true);
    for (const weight of Object.values(tokenValues.fontWeight)) {
      expect(scripted.load).toHaveBeenCalledWith(
        expect.stringContaining(`${weight} `),
      );
      expect(scripted.check).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${weight} .*IBM Plex Sans`)),
      );
    }
  });

  it("fails when the font set reports the face is not loaded", async () => {
    const result = await checkFontGate(deps({ checks: false }));
    expect(result.loaded).toBe(false);
    expect(result.reason).toMatch(/not loaded/);
  });

  it("fails when the text measures the same as the metric-matched fallback", async () => {
    const result = await checkFontGate(
      deps({ plexWidth: 560 + MIN_WIDTH_DIFFERENCE_PX / 2 }),
    );
    expect(result.loaded).toBe(false);
    expect(result.reason).toMatch(/fallback/);
  });

  it("fails when text cannot be measured", async () => {
    const result = await checkFontGate(deps({ plexWidth: null }));
    expect(result.loaded).toBe(false);
  });

  it("treats a failed font request as not loaded rather than throwing", async () => {
    const result = await checkFontGate(
      deps({ loadFails: true, checks: false }),
    );
    expect(result.loaded).toBe(false);
  });
});
