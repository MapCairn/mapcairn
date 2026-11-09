import { tokenValues } from "@karta/theme";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkerGlyph } from "./MarkerGlyph";

const { edge, halo, edgeWidth, haloWidth } = tokenValues.dataMarker;

function paint(shape: "circle" | "square" | "diamond" | "triangle") {
  const { container } = render(
    <MarkerGlyph shape={shape} colour="ordinal-5" radius={6} />,
  );
  const svg = container.querySelector("svg") as SVGSVGElement;
  // Each shape sits in a group that carries its paint.
  const shapes = [...svg.querySelectorAll("g")] as SVGElement[];
  return { svg, shapes };
}

describe("MarkerGlyph", () => {
  it("is decorative: the words beside it carry the meaning", () => {
    const { svg } = paint("circle");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("draws the fill over a dark edge over a white halo, the marker the map draws, in both themes", () => {
    const { shapes } = paint("circle");
    // Back to front: halo, edge, fill.
    expect(shapes).toHaveLength(3);
    expect(shapes.map((layer) => layer.children.length)).toEqual([1, 1, 1]);
    const [outer, inner, fill] = shapes as [SVGElement, SVGElement, SVGElement];
    expect(outer).toHaveAttribute("fill", halo);
    expect(outer).toHaveAttribute("stroke", halo);
    expect(Number(outer.getAttribute("stroke-width"))).toBe(
      2 * (edgeWidth + haloWidth),
    );
    expect(inner).toHaveAttribute("fill", edge);
    expect(inner).toHaveAttribute("stroke", edge);
    expect(Number(inner.getAttribute("stroke-width"))).toBe(2 * edgeWidth);
    expect(fill).toHaveAttribute("fill", tokenValues.dataPalette["ordinal-5"]);
    expect(fill).not.toHaveAttribute("stroke");
  });

  it("makes room for the edge and halo around every shape", () => {
    for (const shape of ["circle", "square", "diamond", "triangle"] as const) {
      const { svg } = paint(shape);
      const extent = Number(svg.getAttribute("width")) / 2;
      expect(extent).toBeGreaterThanOrEqual(6 + edgeWidth + haloWidth);
    }
  });
});
