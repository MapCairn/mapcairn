import { FakeMapAdapter, type RouteLeg } from "@mapcairn/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChromeLayoutProvider } from "../../chrome/layoutContext";
import {
  testChromeLayout,
  testMapContext,
} from "../../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../../host";
import { MapOverlayLayer } from "../../host/overlays/MapOverlayLayer";
import { DirectionsOverlay } from "./DirectionsOverlay";
import {
  AREA_LAYER_ID,
  MapDirections,
  ROUTE_CASING_LAYER_ID,
  ROUTE_FIT_MAX_ZOOM,
  ROUTE_LAYER_ID,
} from "./MapDirections";
import type { AreaOutcome, RouteOutcome } from "./useDirections";

const LEG: RouteLeg = {
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [2.3522, 48.8566],
      [2.4, 48.9],
    ],
  },
  properties: { distance: 6000, duration: 600 },
};

const ROUTE: RouteOutcome = {
  kind: "route",
  mode: "drive",
  stops: [
    { id: "a", position: { lat: 48.8566, lng: 2.3522 } },
    { id: "b", position: { lat: 48.9, lng: 2.4 } },
  ],
  legs: [LEG],
  distance: 6000,
  duration: 600,
};

const AREA: AreaOutcome = {
  kind: "area",
  mode: "walk",
  minutes: 10,
  origin: { lat: 48.8566, lng: 2.3522 },
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.3, 48.8],
            [2.4, 48.8],
            [2.4, 48.9],
            [2.3, 48.8],
          ],
        ],
      },
      properties: { minutes: 10 },
    },
  ],
  size: 1,
};

function renderIn(ui: React.ReactNode, adapter = new FakeMapAdapter()) {
  const view = render(
    <ChromeLayoutProvider
      value={testChromeLayout({ viewport: { width: 390, height: 800 } })}
    >
      <MapContext.Provider value={testMapContext({ adapter })}>
        {ui}
      </MapContext.Provider>
    </ChromeLayoutProvider>,
  );
  return { ...view, adapter };
}

describe("MapDirections", () => {
  it("draws a route as a casing under the line, and nothing else", () => {
    const { adapter } = renderIn(<MapDirections result={ROUTE} />);
    expect(adapter.drawnLayers().map((layer) => layer.id)).toEqual([
      ROUTE_CASING_LAYER_ID,
      ROUTE_LAYER_ID,
    ]);
  });

  it("draws an area as one shape layer", () => {
    const { adapter } = renderIn(<MapDirections result={AREA} />);
    expect(adapter.drawnLayers()).toEqual([
      { id: AREA_LAYER_ID, kind: "shapes", count: 1 },
    ]);
  });

  it("draws nothing for no result, and removes what it drew when the result goes", () => {
    const adapter = new FakeMapAdapter();
    const view = renderIn(<MapDirections result={ROUTE} />, adapter);
    expect(adapter.drawnLayers()).toHaveLength(2);
    view.rerender(
      <ChromeLayoutProvider value={testChromeLayout()}>
        <MapContext.Provider value={testMapContext({ adapter })}>
          <MapDirections result={null} />
        </MapContext.Provider>
      </ChromeLayoutProvider>,
    );
    expect(adapter.drawnLayers()).toEqual([]);
  });

  it("swaps a route for an area without leaving the route behind", () => {
    const adapter = new FakeMapAdapter();
    const view = renderIn(<MapDirections result={ROUTE} />, adapter);
    view.rerender(
      <ChromeLayoutProvider value={testChromeLayout()}>
        <MapContext.Provider value={testMapContext({ adapter })}>
          <MapDirections result={AREA} />
        </MapContext.Provider>
      </ChromeLayoutProvider>,
    );
    expect(adapter.drawnLayers().map((layer) => layer.id)).toEqual([
      AREA_LAYER_ID,
    ]);
  });

  it("fits the map to the result, no closer than the route fit limit", () => {
    const { adapter } = renderIn(<MapDirections result={ROUTE} />);
    const view = adapter.getView();
    expect(view.zoom).toBeLessThanOrEqual(ROUTE_FIT_MAX_ZOOM);
    expect(view.center.lat).toBeCloseTo((48.8566 + 48.9) / 2, 3);
    expect(view.center.lng).toBeCloseTo((2.3522 + 2.4) / 2, 3);
  });

  it("does nothing before the map has mounted", () => {
    render(
      <ChromeLayoutProvider value={testChromeLayout()}>
        <MapContext.Provider value={testMapContext({ adapter: null })}>
          <MapDirections result={ROUTE} />
        </MapContext.Provider>
      </ChromeLayoutProvider>,
    );
    expect(screen.queryByTestId("anything")).toBeNull();
  });
});

describe("DirectionsOverlay", () => {
  it("draws a lettered disc for each stop, in order", () => {
    renderIn(
      <svg aria-hidden="true">
        <title>stops</title>
        <DirectionsOverlay stops={ROUTE.stops} showCrosshair={false} />
      </svg>,
    );
    const stops = screen.getAllByTestId("directions-stop");
    expect(stops.map((stop) => stop.textContent)).toEqual(["A", "B"]);
    expect(screen.queryByTestId("directions-crosshair")).toBeNull();
  });

  it("draws the crosshair where a stop added at the map centre will go", () => {
    renderIn(
      <svg aria-hidden="true">
        <title>stops</title>
        <DirectionsOverlay stops={[]} showCrosshair />
      </svg>,
    );
    const lines = screen
      .getByTestId("directions-crosshair")
      .querySelectorAll("line");
    // The free centre of an 800 px map with a half-height sheet over it.
    expect(Number(lines[0]?.getAttribute("y1"))).toBe(200);
    expect(Number(lines[1]?.getAttribute("x1"))).toBe(195);
  });

  it("draws nothing before the map has mounted", () => {
    const { container } = render(
      <ChromeLayoutProvider value={testChromeLayout()}>
        <MapContext.Provider value={testMapContext({ adapter: null })}>
          <MapOverlayLayer>
            <DirectionsOverlay stops={ROUTE.stops} showCrosshair />
          </MapOverlayLayer>
        </MapContext.Provider>
      </ChromeLayoutProvider>,
    );
    expect(container.querySelector("circle")).toBeNull();
  });
});
