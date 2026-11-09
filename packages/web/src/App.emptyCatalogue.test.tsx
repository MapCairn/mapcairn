import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const map = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("@karta/map/MapView", () => ({
  MapView: (props: Record<string, unknown>) => {
    map.props = props;
    return <div data-testid="map-view" />;
  },
}));

import { App } from "./App";
import { getLayerGroups, getLayers } from "./layers/registry";
import { useMapUiStore } from "./stores/useMapUiStore";

describe("empty map catalogue", () => {
  beforeEach(() => {
    useMapUiStore.getState().reset();
  });

  it("publishes no datasets", () => {
    expect(getLayers()).toEqual([]);
    expect(getLayerGroups()).toEqual([]);
  });

  it("keeps basemaps, search and measurement without dataset tabs or fetches", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<App />);
    await screen.findByTestId("map-view");
    fireEvent.click(screen.getByTestId("panel-toggle"));
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Basemap" })).toBeInTheDocument();
    await waitFor(() => expect(map.props.measurementTool).toBe(true));
    expect(map.props.areas).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
