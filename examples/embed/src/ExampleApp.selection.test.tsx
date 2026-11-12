// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExampleApp } from "./ExampleApp";

// No component reads the selected set yet, so this test puts a probe where
// the map's data layers are, which is inside the provider the example mounts
// around the map and the chrome. The probe reads it the way a component will.
vi.mock("@mapcairn/map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mapcairn/map")>();
  function SelectionProbe() {
    const selection = actual.useSelection();
    if (!selection) {
      return <p data-testid="selection-probe">no selection</p>;
    }
    return (
      <>
        <p data-testid="selection-probe">
          {selection.entries.length} selected of {selection.limit}
        </p>
        <button
          type="button"
          onClick={() =>
            selection.add([{ layerId: "example-cairns", featureId: "north" }])
          }
        >
          Add probe
        </button>
      </>
    );
  }
  return { ...actual, MapDataLayers: SelectionProbe };
});

afterEach(cleanup);

describe("ExampleApp feature selection", () => {
  it("offers the selected set on the fakes' store, so a host can see it", async () => {
    render(<ExampleApp />);

    expect((await screen.findByTestId("selection-probe")).textContent).toBe(
      "0 selected of 200",
    );
    expect(screen.getByRole("button", { name: "Add probe" })).toBeTruthy();
  });

  it("selects through that store and tells the live region once", async () => {
    render(<ExampleApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Add probe" }));

    expect(screen.getByTestId("live-region-polite").textContent).toMatch(
      /1 selected\.$/,
    );
  });
});
