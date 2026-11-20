// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { contrastPairs } from "./contrastPairs";

describe("contrastPairs", () => {
  it("lists every pair a theme must keep, so deleting one fails here", () => {
    const summary = contrastPairs.map(
      (pair) =>
        `${pair.foreground} on ${pair.background} ${pair.required}:1 over ${pair.backdrops.join("+") || "nothing"}`,
    );
    const everyBackdrop = "white+black+lightMap+defaultBasemap";

    expect(summary).toEqual([
      ...["surface", "surfaceRaised"].flatMap((background) => [
        `text on ${background} 4.5:1 over ${everyBackdrop}`,
        `textMuted on ${background} 4.5:1 over ${everyBackdrop}`,
        `accent on ${background} 4.5:1 over ${everyBackdrop}`,
        `danger on ${background} 4.5:1 over ${everyBackdrop}`,
        `controlBoundary on ${background} 3:1 over ${everyBackdrop}`,
        `focusRing on ${background} 3:1 over ${everyBackdrop}`,
      ]),
      "accentContrast on accent 4.5:1 over nothing",
      "text on accentTint 4.5:1 over nothing",
      "accent on accentTint 4.5:1 over nothing",
      "textMuted on accentTint 4.5:1 over nothing",
      "controlBoundary on accentTint 3:1 over nothing",
      "text on dangerTint 4.5:1 over nothing",
      "danger on dangerTint 4.5:1 over nothing",
      "focusRing on map 3:1 over white+black",
      "focusRingInner on focusRing 3:1 over nothing",
      "text on pageBackground 4.5:1 over nothing",
      "textMuted on pageBackground 4.5:1 over nothing",
      "accent on pageBackground 4.5:1 over nothing",
      "text on mapHalo 4.5:1 over nothing",
    ]);
  });
});
