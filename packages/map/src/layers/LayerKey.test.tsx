// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LayerKey } from "./LayerKey";

describe("LayerKey", () => {
  it("is a list named by the caller, with a row of words for each entry", () => {
    render(
      <LayerKey
        definition={SAMPLE_ALERT_LAYER}
        label="Key for Sample alerts"
        testId="key-alerts"
      />,
    );
    const key = screen.getByRole("list", { name: "Key for Sample alerts" });
    expect(key).toBe(screen.getByTestId("key-alerts"));
    const rows = within(key).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.textContent?.trim()).not.toBe("");
      expect(row.querySelector("svg")).not.toBeNull();
    }
  });

  it("names a heatmap's steps in words", () => {
    render(
      <LayerKey definition={SAMPLE_HEATMAP_LAYER} label="Key" testId="k" />,
    );
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(
      SAMPLE_HEATMAP_LAYER.heatmap.words,
    );
  });

  it("arranges the rows side by side by default and one to a line when stacked", () => {
    const { rerender } = render(
      <LayerKey definition={SAMPLE_ALERT_LAYER} label="Key" testId="k" />,
    );
    const wrapped = screen.getByRole("list").className;
    const wrappedRow = screen.getAllByRole("listitem")[0]?.className;
    rerender(
      <LayerKey
        definition={SAMPLE_ALERT_LAYER}
        label="Key"
        testId="k"
        layout="stacked"
      />,
    );
    expect(screen.getByRole("list").className).not.toBe(wrapped);
    expect(screen.getAllByRole("listitem")[0]?.className).not.toBe(wrappedRow);
  });

  it("renders nothing for a layer whose definition has no key", () => {
    const { container } = render(
      <LayerKey definition={SAMPLE_TILE_LAYER} label="Key" testId="k" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
