// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { contrastPairs, measurePair } from "./contrastPairs";
import { themeValues } from "./tokenValues";

describe("contrastPairs", () => {
  it("lists every pair a theme must keep, so deleting one fails here", () => {
    const summary = contrastPairs.map(
      (pair) =>
        `${pair.foreground} on ${pair.background} ${pair.required}:1 over ${pair.backdrops.join("+") || "nothing"}`,
    );
    const everyBackdrop =
      "white+black+lightMap+defaultBasemap+defaultDarkBasemap";

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
      "focusRing on map 3:1 over white+black+defaultDarkBasemap",
      "focusRingInner on focusRing 3:1 over nothing",
      "text on pageBackground 4.5:1 over nothing",
      "textMuted on pageBackground 4.5:1 over nothing",
      "accent on pageBackground 4.5:1 over nothing",
      "text on mapHalo 4.5:1 over nothing",
    ]);
  });
});

describe("the focus ring on the bare map", () => {
  const pair = contrastPairs.find(
    (candidate) =>
      candidate.foreground === "focusRing" && candidate.background === "map",
  );

  it("is judged by its better tone, because the inner tone shows where the outer one does not", () => {
    expect(pair?.alternate).toBe("focusRingInner");
  });

  it("shows on a mid-dark map in the dark theme by the outer tone, and in the light theme by the inner one", () => {
    for (const theme of ["light", "dark"] as const) {
      const roles = themeValues[theme].colour;
      expect(
        measurePair(
          roles,
          pair as NonNullable<typeof pair>,
          "defaultDarkBasemap",
        ),
        theme,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("takes the foreground alone when no alternate is named", () => {
    const roles = themeValues.light.colour;
    const plain = {
      ...(pair as NonNullable<typeof pair>),
      alternate: undefined,
    };
    expect(measurePair(roles, plain, "defaultDarkBasemap")).toBeLessThan(3);
  });
});
