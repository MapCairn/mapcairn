import { describe, expect, it } from "vitest";
import { resolveNonOverlappingLabels } from "./labelCollision";

describe("resolveNonOverlappingLabels", () => {
  it("keeps the most important label when bounds overlap", () => {
    expect(
      resolveNonOverlappingLabels([
        {
          id: "suburb",
          priority: "secondary",
          bounds: { left: 0, right: 40, top: 0, bottom: 12 },
        },
        {
          id: "major-place",
          priority: "major",
          bounds: { left: 10, right: 50, top: 0, bottom: 12 },
        },
      ]),
    ).toEqual(["major-place"]);
  });

  it("keeps non-overlapping labels and preserves input order for equal priority", () => {
    expect(
      resolveNonOverlappingLabels([
        {
          id: "first",
          priority: "primary",
          bounds: { left: 0, right: 20, top: 0, bottom: 12 },
        },
        {
          id: "second",
          priority: "primary",
          bounds: { left: 10, right: 30, top: 0, bottom: 12 },
        },
        {
          id: "separate",
          priority: "secondary",
          bounds: { left: 40, right: 60, top: 0, bottom: 12 },
        },
      ]),
    ).toEqual(["first", "separate"]);
  });
});
