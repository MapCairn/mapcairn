import {
  createFakeServices,
  FAKE_VECTOR_BASEMAP,
  type FakeMapAdapter,
  type FakeServices,
  type LatLng,
  type ViewState,
} from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { MapView } from "../MapView";
import {
  AccuracyCircle,
  CentreCrosshair,
  MapOverlayLayer,
  MEASURE_VERTEX_RADIUS_PX,
  MeasureOverlay,
  MIN_ACCURACY_RADIUS_PX,
  PinMarker,
  projectPoints,
  screenRadiusForMetres,
} from ".";

const VIEW: ViewState = { center: { lat: 10, lng: 20 }, zoom: 6, bearing: 0 };
const A: LatLng = { lat: 10, lng: 20 };
const B: LatLng = { lat: 10.5, lng: 20.5 };
const C: LatLng = { lat: 9.5, lng: 21 };
const HOVER: LatLng = { lat: 9.8, lng: 19.6 };

let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  act(() => {
    const queued = frames;
    frames = [];
    for (const callback of queued) {
      callback(0);
    }
  });
}

async function renderOverlays(
  children: ReactNode,
  services: FakeServices = createFakeServices(),
) {
  const view = render(
    <ServicesProvider services={services}>
      <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP} testId="map">
        <MapOverlayLayer testId="overlays">{children}</MapOverlayLayer>
      </MapView>
    </ServicesProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  const adapter = services.fakes.maps[0] as FakeMapAdapter;
  return { ...view, adapter };
}

function translateOf(element: Element): string | null {
  return element.getAttribute("transform");
}

function expectedTranslate(adapter: FakeMapAdapter, point: LatLng): string {
  const { x, y } = adapter.project(point);
  return `translate(${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100})`;
}

describe("screenRadiusForMetres", () => {
  it("divides the distance by the ground resolution", () => {
    expect(screenRadiusForMetres(100, 2)).toBe(50);
  });

  it("never returns less than the minimum", () => {
    expect(screenRadiusForMetres(1, 10, 8)).toBe(8);
    expect(screenRadiusForMetres(1000, 10, 8)).toBe(100);
  });

  it("returns the minimum for a resolution or distance that makes no sense", () => {
    expect(screenRadiusForMetres(100, 0, 3)).toBe(3);
    expect(screenRadiusForMetres(100, Number.NaN)).toBe(0);
    expect(screenRadiusForMetres(-5, 1, 2)).toBe(2);
    expect(screenRadiusForMetres(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });
});

describe("projectPoints", () => {
  it("projects each point in order", () => {
    const project = (point: LatLng) => ({ x: point.lng, y: point.lat });
    expect(projectPoints({ project }, [A, B])).toEqual([
      { x: 20, y: 10 },
      { x: 20.5, y: 10.5 },
    ]);
  });
});

describe("MapOverlayLayer", () => {
  it("is one SVG layer hidden from assistive technology", async () => {
    await renderOverlays(<PinMarker position={A} />);
    const layer = screen.getByTestId("overlays");
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getByTestId("map").contains(layer)).toBe(true);
  });

  it("server-renders empty, with no style attributes", () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP}>
          <MapOverlayLayer>
            <PinMarker position={A} testId="pin" />
            <MeasureOverlay points={[A, B]} mode="distance" testId="m" />
            <AccuracyCircle center={A} accuracyMetres={50} testId="acc" />
            <CentreCrosshair testId="cross" />
          </MapOverlayLayer>
        </MapView>
      </ServicesProvider>,
    );
    expect(html).toMatch(/aria-hidden="true"/);
    expect(html).not.toMatch(/style=/);
    expect(html).not.toMatch(/data-testid="(pin|m|acc|cross)"/);
  });
});

describe("PinMarker", () => {
  it("draws the pin at the projected point and follows the view", async () => {
    const { adapter } = await renderOverlays(
      <PinMarker position={B} testId="pin" />,
    );
    const pin = screen.getByTestId("pin");
    expect(translateOf(pin)).toBe(expectedTranslate(adapter, B));
    expect(pin.querySelector("path")?.getAttribute("class")).toBeTruthy();
    act(() => {
      adapter.panBy(40, -25);
    });
    flushFrames();
    expect(translateOf(screen.getByTestId("pin"))).toBe(
      expectedTranslate(adapter, B),
    );
  });
});

describe("MeasureOverlay", () => {
  it("draws only a vertex for a single point", async () => {
    await renderOverlays(
      <MeasureOverlay points={[A]} mode="distance" testId="m" />,
    );
    const group = screen.getByTestId("m");
    expect(group.querySelectorAll("circle")).toHaveLength(1);
    expect(group.querySelector("polyline")).toBeNull();
    expect(group.querySelector("circle")).toHaveAttribute(
      "r",
      String(MEASURE_VERTEX_RADIUS_PX),
    );
  });

  it("draws an open line with a halo for a distance", async () => {
    const { adapter } = await renderOverlays(
      <MeasureOverlay points={[A, B, C]} mode="distance" testId="m" />,
    );
    const group = screen.getByTestId("m");
    const lines = group.querySelectorAll("polyline");
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute("class")).not.toBe(
      lines[1]?.getAttribute("class"),
    );
    const [a, b, c] = [A, B, C].map((point) => adapter.project(point));
    const round = (n: number) => Math.round(n * 100) / 100;
    expect(lines[1]?.getAttribute("points")).toBe(
      [a, b, c].map((p) => `${round(p?.x ?? 0)},${round(p?.y ?? 0)}`).join(" "),
    );
    expect(group.querySelector("polygon")).toBeNull();
    expect(group.querySelectorAll("circle")).toHaveLength(3);
  });

  it("draws a closed, filled polygon for an area", async () => {
    await renderOverlays(
      <MeasureOverlay points={[A, B, C]} mode="area" testId="m" />,
    );
    const group = screen.getByTestId("m");
    expect(group).toHaveAttribute("data-mode", "area");
    // Fill, halo outline and line outline.
    expect(group.querySelectorAll("polygon")).toHaveLength(3);
    expect(group.querySelector("polyline")).toBeNull();
  });

  it("previews the hover point from the last point for a distance", async () => {
    await renderOverlays(
      <MeasureOverlay
        points={[A, B]}
        mode="distance"
        hover={HOVER}
        testId="m"
      />,
    );
    // Committed line and preview, each with a halo.
    const lines = screen.getByTestId("m").querySelectorAll("polyline");
    expect(lines).toHaveLength(4);
    expect(lines[3]?.getAttribute("points")?.split(" ")).toHaveLength(2);
  });

  it("previews the hover point closing back to the first point for an area", async () => {
    await renderOverlays(
      <MeasureOverlay points={[A, B]} mode="area" hover={HOVER} testId="m2" />,
    );
    const area = screen.getByTestId("m2");
    // A fill from the two points and the hover point.
    expect(area.querySelectorAll("polygon")).toHaveLength(1);
    const preview = area.querySelectorAll("polyline")[3];
    expect(preview?.getAttribute("points")?.split(" ")).toHaveLength(3);
  });

  it("previews from a single point without a fill", async () => {
    await renderOverlays(
      <MeasureOverlay points={[A]} mode="area" hover={HOVER} testId="m" />,
    );
    const group = screen.getByTestId("m");
    expect(group.querySelector("polygon")).toBeNull();
    const lines = group.querySelectorAll("polyline");
    expect(lines).toHaveLength(2);
    expect(lines[1]?.getAttribute("points")?.split(" ")).toHaveLength(2);
  });

  it("ignores the hover point when there is nothing to connect it to", async () => {
    await renderOverlays(
      <MeasureOverlay points={[]} mode="distance" hover={HOVER} testId="m" />,
    );
    expect(screen.getByTestId("m").childElementCount).toBe(0);
  });
});

describe("AccuracyCircle", () => {
  it("sizes the circle from the ground resolution at its latitude", async () => {
    const { adapter } = await renderOverlays(
      <AccuracyCircle center={A} accuracyMetres={20_000} testId="acc" />,
    );
    const circle = screen.getByTestId("acc");
    const expected = 20_000 / adapter.metresPerPixel(A.lat);
    expect(Number(circle.getAttribute("r"))).toBeCloseTo(expected, 1);
    act(() => {
      adapter.zoomIn();
    });
    flushFrames();
    expect(Number(screen.getByTestId("acc").getAttribute("r"))).toBeCloseTo(
      expected * 2,
      1,
    );
  });

  it("keeps a tiny circle visible", async () => {
    await renderOverlays(
      <AccuracyCircle center={A} accuracyMetres={1} testId="acc" />,
    );
    expect(screen.getByTestId("acc")).toHaveAttribute(
      "r",
      String(MIN_ACCURACY_RADIUS_PX),
    );
  });
});

describe("CentreCrosshair", () => {
  it("crosses at the projected centre of the view", async () => {
    const { adapter } = await renderOverlays(<CentreCrosshair testId="x" />);
    const centre = adapter.project(adapter.getView().center);
    const lines = screen.getByTestId("x").querySelectorAll("line");
    expect(lines).toHaveLength(4);
    expect(Number(lines[0]?.getAttribute("y1"))).toBeCloseTo(centre.y, 1);
    expect(Number(lines[1]?.getAttribute("x1"))).toBeCloseTo(centre.x, 1);
  });

  it("crosses where it is told to when part of the map is covered", async () => {
    await renderOverlays(<CentreCrosshair at={{ x: 120, y: 80 }} testId="x" />);
    const lines = screen.getByTestId("x").querySelectorAll("line");
    expect(Number(lines[0]?.getAttribute("y1"))).toBe(80);
    expect(Number(lines[1]?.getAttribute("x1"))).toBe(120);
  });
});
