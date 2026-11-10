import { tokenValues } from "@mapcairn/theme";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShapeGlyph } from "./ShapeGlyph";

const { edge, halo } = tokenValues.dataMarker;

function paint(props: Partial<Parameters<typeof ShapeGlyph>[0]> = {}) {
  const { container } = render(
    <ShapeGlyph swatch="area" colour="ordinal-3" {...props} />,
  );
  return container.querySelector("svg") as SVGSVGElement;
}

describe("ShapeGlyph", () => {
  it("is decorative: the words beside it carry the meaning", () => {
    const svg = paint();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("fills an area swatch with the colour and outlines it in the ink", () => {
    const svg = paint({ width: 2 });
    const fill = svg.querySelector("[data-part='fill']") as SVGElement;
    const outline = svg.querySelector("[data-part='outline']") as SVGElement;
    expect(fill).toHaveAttribute("fill", tokenValues.dataPalette["ordinal-3"]);
    expect(outline).toHaveAttribute("stroke", edge);
    expect(outline).toHaveAttribute("stroke-width", "2");
    expect(outline).not.toHaveAttribute("stroke-dasharray");
  });

  it("hatches an area swatch with a pattern, and draws none for solid", () => {
    expect(paint({ pattern: "solid" }).querySelector("pattern")).toBeNull();
    for (const pattern of ["stripes", "dots", "crosshatch"] as const) {
      const svg = paint({ pattern });
      expect(svg).toHaveAttribute("data-pattern", pattern);
      const defs = svg.querySelector("pattern") as SVGPatternElement;
      const hatch = svg.querySelector("[data-part='hatch']") as SVGElement;
      expect(hatch.getAttribute("fill")).toBe(`url(#${defs.id})`);
    }
  });

  it("gives every instance its own pattern id", () => {
    const first = paint({ pattern: "dots" }).querySelector("pattern");
    const second = paint({ pattern: "dots" }).querySelector("pattern");
    expect(first?.id).not.toBe(second?.id);
  });

  it("dashes the outline of an area swatch", () => {
    const outline = paint({ dash: "dashed" }).querySelector(
      "[data-part='outline']",
    );
    expect(outline).toHaveAttribute("stroke-dasharray", "4 3");
    expect(
      paint({ dash: "dotted" }).querySelector("[data-part='outline']"),
    ).toHaveAttribute("stroke-dasharray", "1 3");
  });

  it("draws a line swatch as a coloured stroke over a white casing, with its width and dash", () => {
    const svg = paint({
      swatch: "line",
      colour: "vermillion",
      width: 5,
      dash: "dashed",
    });
    const casing = svg.querySelector("[data-part='casing']") as SVGElement;
    const line = svg.querySelector("[data-part='line']") as SVGElement;
    expect(casing).toHaveAttribute("stroke", halo);
    expect(line).toHaveAttribute("stroke", tokenValues.dataPalette.vermillion);
    expect(line).toHaveAttribute("stroke-width", "5");
    expect(line).toHaveAttribute("stroke-dasharray", "4 3");
    expect(Number(casing.getAttribute("stroke-width"))).toBeGreaterThan(5);
  });

  it("caps a very wide stroke so it fits the swatch", () => {
    const line = paint({ swatch: "line", width: 12 }).querySelector(
      "[data-part='line']",
    );
    expect(Number(line?.getAttribute("stroke-width"))).toBeLessThanOrEqual(6);
  });
});
