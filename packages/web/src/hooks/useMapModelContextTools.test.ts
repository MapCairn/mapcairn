import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  layers: [] as {
    id: string;
    label: string;
    description?: string;
    available: boolean;
  }[],
  search: vi.fn(),
  theme: vi.fn(),
}));
vi.mock("../layers/registry", () => ({
  getLayers: () => mocks.layers,
  getLayer: (id: string) => mocks.layers.find((layer) => layer.id === id),
  getLayerGroupStructure: () => [],
}));
vi.mock("@karta/map", async (original) => ({
  ...(await original<typeof import("@karta/map")>()),
  fetchLocationSearchResults: mocks.search,
}));
vi.mock("@karta/react", async (original) => ({
  ...(await original<typeof import("@karta/react")>()),
  setThemePreference: mocks.theme,
}));

import { useMapUiStore } from "../stores/useMapUiStore";
import { useMapModelContextTools } from "./useMapModelContextTools";

type Tool = { name: string; execute: (input: unknown) => unknown };
const registerTool = vi.fn();
const onLocationSelect = vi.fn(() => "Moved");
const onRequestMeasurement = vi.fn();
const options = { onLocationSelect, onRequestMeasurement };

function tool(name: string): Tool {
  const found = registerTool.mock.calls
    .map(([definition]) => definition as Tool)
    .find((definition) => definition.name === name);
  if (!found) {
    throw new Error(`Missing tool ${name}`);
  }
  return found;
}

describe("map tools", () => {
  beforeEach(() => {
    useMapUiStore.getState().reset();
    mocks.layers = [];
    mocks.search.mockReset();
    mocks.theme.mockReset();
    registerTool.mockClear();
    onLocationSelect.mockClear();
    onRequestMeasurement.mockClear();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });
  });

  it("registers generic controls and measurement tools only", async () => {
    renderHook(() => useMapModelContextTools(options));
    expect(
      registerTool.mock.calls.map(([definition]) => definition.name),
    ).toEqual([
      "list-map-layers",
      "toggle-map-layer",
      "search-map-location",
      "set-map-basemap",
      "set-app-theme",
      "measure-distance",
      "measure-area",
    ]);
    expect(JSON.stringify(await tool("list-map-layers").execute({}))).toContain(
      "no layers available",
    );
    expect(
      JSON.stringify(
        await tool("toggle-map-layer").execute({ layerId: "missing" }),
      ),
    ).toContain("No layer");
  });

  it("keeps configured layer tools functional", async () => {
    mocks.layers = [
      { id: "one", label: "One", description: "First", available: true },
      { id: "two", label: "Two", available: true },
      { id: "later", label: "Later", available: false },
    ];
    renderHook(() => useMapModelContextTools(options));
    expect(JSON.stringify(await tool("list-map-layers").execute({}))).toContain(
      "First",
    );
    await tool("toggle-map-layer").execute({ layerId: "one" });
    expect(useMapUiStore.getState().visibleLayerIds).toEqual(["one"]);
    expect(JSON.stringify(await tool("list-map-layers").execute({}))).toContain(
      "(visible)",
    );
    await tool("toggle-map-layer").execute({ layerId: "one" });
    expect(useMapUiStore.getState().visibleLayerIds).toEqual([]);
    expect(
      JSON.stringify(
        await tool("toggle-map-layer").execute({ layerId: "later" }),
      ),
    ).toContain("available yet");
  });

  it("searches without dataset constraints and handles no matches", async () => {
    renderHook(() => useMapModelContextTools(options));
    mocks.search.mockResolvedValueOnce([]);
    expect(
      JSON.stringify(
        await tool("search-map-location").execute({ query: "missing" }),
      ),
    ).toContain("No place");
    const result = {
      id: "place",
      label: "London",
      latitude: 51.5,
      longitude: 0,
    };
    mocks.search.mockResolvedValueOnce([result]);
    await tool("search-map-location").execute({ query: "London" });
    expect(onLocationSelect).toHaveBeenCalledWith(result);
  });

  it("validates and changes basemaps and themes", async () => {
    renderHook(() => useMapModelContextTools(options));
    expect(
      JSON.stringify(
        await tool("set-map-basemap").execute({ basemap: "missing" }),
      ),
    ).toContain("Unknown");
    await tool("set-map-basemap").execute({ basemap: "topo" });
    expect(useMapUiStore.getState().basemap).toBe("topo");
    expect(
      JSON.stringify(await tool("set-app-theme").execute({ theme: "missing" })),
    ).toContain("Unknown");
    await tool("set-app-theme").execute({ theme: "dark" });
    expect(mocks.theme).toHaveBeenCalledWith("dark");
  });

  it.each([
    ["measure-distance", "distance", ["A", "B"]],
    ["measure-area", "area", ["A", "B", "C"]],
  ])(
    "plots %s on the on-screen measurement tool",
    async (name, mode, locations) => {
      renderHook(() => useMapModelContextTools(options));
      const queries = locations as string[];
      expect(
        JSON.stringify(await tool(name as string).execute({ locations: [] })),
      ).toContain("at least");
      mocks.search.mockResolvedValue([]);
      expect(
        JSON.stringify(
          await tool(name as string).execute({ locations: queries }),
        ),
      ).toContain("No place");
      mocks.search.mockImplementation(async (query: string) => [
        {
          label: query,
          latitude: query === "A" ? 0 : 1,
          longitude: query === "B" ? 0 : 1,
        },
      ]);
      const output = await tool(name as string).execute({ locations: queries });
      expect(onRequestMeasurement).toHaveBeenCalledWith(
        mode,
        expect.any(Array),
      );
      expect(JSON.stringify(output)).toMatch(/Distance|Area/);
    },
  );

  it("is a no-op without WebMCP", () => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
    renderHook(() => useMapModelContextTools(options));
    expect(registerTool).not.toHaveBeenCalled();
  });
});
