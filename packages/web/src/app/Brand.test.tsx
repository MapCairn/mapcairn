// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND_NAME, Brand } from "./Brand";

describe("Brand mark", () => {
  it("is decorative: hidden from assistive technology and never focusable", () => {
    render(<Brand />);
    const mark = screen.getByTestId("brand-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("focusable", "false");
    expect(mark.querySelector("title")).toBeNull();
  });

  it("stacks four stones, each drawn as a halo under its outline", () => {
    render(<Brand />);
    const polygons = screen
      .getByTestId("brand-mark")
      .querySelectorAll("polygon");
    expect(polygons).toHaveLength(8);
    for (let index = 0; index < polygons.length; index += 2) {
      const [halo, stone] = [polygons[index], polygons[index + 1]];
      expect(halo?.getAttribute("points")).toBe(stone?.getAttribute("points"));
      expect(Number(halo?.getAttribute("stroke-width"))).toBeGreaterThan(
        Number(stone?.getAttribute("stroke-width")),
      );
    }
  });

  it("takes its colours from the stylesheet: no colour or style attribute", () => {
    const html = renderToString(<Brand />);
    expect(html).not.toMatch(/style=/);
    expect(html).not.toMatch(/(fill|stroke)="(#|rgb|oklch)/);
  });
});

describe("Brand name", () => {
  it("spells the name of the project", () => {
    render(<Brand />);
    expect(screen.getByTestId("brand-name")).toHaveTextContent(BRAND_NAME);
    expect(BRAND_NAME).toBe("MapCairn");
  });
});
