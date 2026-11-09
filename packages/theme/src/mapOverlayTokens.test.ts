import { describe, expect, it } from "vitest";
import { mapOverlayTokens } from "./mapOverlayTokens";
import { tokens } from "./tokens.css";

describe("mapOverlayTokens", () => {
  it("draws every overlay from the colour tokens", () => {
    const colours = new Set(Object.values(tokens.color));
    for (const [name, reference] of Object.entries(mapOverlayTokens)) {
      expect(colours.has(reference), name).toBe(true);
    }
  });

  it("keeps the line, fill and accuracy roles distinct from each other", () => {
    expect(mapOverlayTokens.measureFill).not.toBe(mapOverlayTokens.measureLine);
    expect(mapOverlayTokens.accuracyFill).not.toBe(
      mapOverlayTokens.accuracyStroke,
    );
  });
});
