import {
  createFakeServices,
  type DrawShape,
  editHandlesFor,
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
import { DrawOverlay, MapOverlayLayer } from ".";

const VIEW: ViewState = { center: { lat: 10, lng: 20 }, zoom: 6, bearing: 0 };
const p = (lng: number, lat: number): LatLng => ({ lat, lng });

const POLYGON: DrawShape = {
  id: "shape-1",
  kind: "polygon",
  label: "Polygon 1",
  vertices: [p(20, 10), p(21, 10), p(20.5, 11)],
  done: true,
};
const LINE: DrawShape = {
  id: "shape-2",
  kind: "line",
  label: "Line 1",
  vertices: [p(19, 9), p(20, 9.5)],
  done: true,
};
const POINT: DrawShape = {
  id: "shape-3",
  kind: "point",
  label: "Point 1",
  vertices: [p(19.5, 10.5)],
  done: true,
};
const CIRCLE: DrawShape = {
  id: "shape-4",
  kind: "circle",
  label: "Circle 1",
  vertices: [p(20, 10)],
  radiusMetres: 20_000,
  done: true,
};

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderOverlay(
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
  return { ...view, adapter: services.fakes.maps[0] as FakeMapAdapter };
}

const shapesIn = () => screen.queryAllByTestId("draw-shape");

describe("DrawOverlay", () => {
  it("draws nothing until the map is mounted, and when server rendered", () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP}>
          <MapOverlayLayer>
            <DrawOverlay shapes={[POLYGON]} selection={null} />
          </MapOverlayLayer>
        </MapView>
      </ServicesProvider>,
    );
    expect(html).not.toContain("draw-shape");
  });

  it("draws each kind of shape with its kind and state", async () => {
    await renderOverlay(
      <DrawOverlay
        shapes={[POLYGON, LINE, POINT, CIRCLE]}
        selection={{ shapeId: "shape-1", vertex: null }}
        testId="draw"
      />,
    );
    expect(shapesIn().map((el) => el.getAttribute("data-kind"))).toEqual([
      "line",
      "point",
      "circle",
      "polygon",
    ]);
    const polygon = shapesIn().find(
      (el) => el.getAttribute("data-shape-id") === "shape-1",
    );
    expect(polygon?.getAttribute("data-selected")).toBe("true");
    expect(polygon?.querySelectorAll("polygon")).toHaveLength(3);
    expect(
      shapesIn()
        .filter((el) => el !== polygon)
        .every((el) => el.getAttribute("data-selected") === "false"),
    ).toBe(true);
  });

  it("draws the selected shape last, so it is on top", async () => {
    await renderOverlay(
      <DrawOverlay
        shapes={[POLYGON, LINE]}
        selection={{ shapeId: "shape-1", vertex: null }}
      />,
    );
    expect(shapesIn().at(-1)?.getAttribute("data-shape-id")).toBe("shape-1");
  });

  it("marks an unfinished shape", async () => {
    await renderOverlay(
      <DrawOverlay shapes={[{ ...POLYGON, done: false }]} selection={null} />,
    );
    expect(shapesIn()[0]?.getAttribute("data-done")).toBe("false");
  });

  it("leaves out a shape that has nothing to draw yet", async () => {
    await renderOverlay(
      <DrawOverlay
        shapes={[
          { ...LINE, vertices: [p(1, 1)], done: false },
          { ...POLYGON, vertices: [], done: false },
          { ...CIRCLE, radiusMetres: undefined, done: false },
        ]}
        selection={null}
      />,
    );
    expect(shapesIn()).toEqual([]);
  });

  it("draws a polygon with two vertices as a line", async () => {
    await renderOverlay(
      <DrawOverlay
        shapes={[{ ...POLYGON, vertices: [p(20, 10), p(21, 10)], done: false }]}
        selection={null}
      />,
    );
    expect(shapesIn()[0]?.querySelectorAll("polyline")).toHaveLength(2);
  });

  it("draws the handles it is given, with their kind, the selected vertex and the hovered one", async () => {
    const selection = { shapeId: "shape-1", vertex: 1 };
    const handles = editHandlesFor([POLYGON], selection);
    await renderOverlay(
      <DrawOverlay
        shapes={[POLYGON]}
        selection={selection}
        handles={handles}
        hoveredHandle="shape-1:v:0"
      />,
    );
    const drawn = screen.getAllByTestId("draw-handle");
    expect(drawn).toHaveLength(6);
    expect(
      drawn.filter((el) => el.getAttribute("data-handle-kind") === "midpoint"),
    ).toHaveLength(3);
    expect(
      drawn
        .find((el) => el.getAttribute("data-handle-id") === "shape-1:v:1")
        ?.getAttribute("data-selected"),
    ).toBe("true");
    expect(
      drawn
        .find((el) => el.getAttribute("data-handle-id") === "shape-1:v:0")
        ?.getAttribute("data-hovered"),
    ).toBe("true");
  });

  it("draws a circle's radius handle as a square", async () => {
    const selection = { shapeId: "shape-4", vertex: null };
    await renderOverlay(
      <DrawOverlay
        shapes={[CIRCLE]}
        selection={selection}
        handles={editHandlesFor([CIRCLE], selection)}
        hoveredHandle="shape-4:r"
      />,
    );
    const radius = screen
      .getAllByTestId("draw-handle")
      .find((el) => el.getAttribute("data-handle-kind") === "radius");
    expect(radius?.tagName.toLowerCase()).toBe("rect");
  });

  it("draws the handles where the map projects them", async () => {
    const selection = { shapeId: "shape-1", vertex: null };
    const { adapter } = await renderOverlay(
      <DrawOverlay
        shapes={[POLYGON]}
        selection={selection}
        handles={editHandlesFor([POLYGON], selection)}
      />,
    );
    const first = screen
      .getAllByTestId("draw-handle")
      .find((el) => el.getAttribute("data-handle-id") === "shape-1:v:0");
    const at = adapter.project(POLYGON.vertices[0] as LatLng);
    expect(Number(first?.getAttribute("cx"))).toBeCloseTo(at.x, 1);
    expect(Number(first?.getAttribute("cy"))).toBeCloseTo(at.y, 1);
  });

  describe("preview", () => {
    it("draws a dashed edge to the pointer for a line being drawn", async () => {
      await renderOverlay(
        <DrawOverlay
          shapes={[{ ...LINE, done: false }]}
          selection={null}
          hover={p(21, 11)}
          testId="draw"
        />,
      );
      expect(
        screen.getByTestId("draw").querySelectorAll("polyline").length,
      ).toBeGreaterThan(2);
    });

    it("closes back to the first vertex for a polygon being drawn", async () => {
      await renderOverlay(
        <DrawOverlay
          shapes={[{ ...POLYGON, done: false }]}
          selection={null}
          hover={p(21, 11)}
          testId="draw"
        />,
      );
      const previews = [
        ...screen.getByTestId("draw").querySelectorAll("polyline"),
      ].filter(
        (el) => (el.getAttribute("points") ?? "").split(" ").length === 3,
      );
      expect(previews.length).toBeGreaterThan(0);
    });

    it("draws a ring for a circle being drawn, but nothing at its own centre", async () => {
      const draft = { ...CIRCLE, radiusMetres: undefined, done: false };
      await renderOverlay(
        <DrawOverlay
          shapes={[draft]}
          selection={null}
          hover={p(20.2, 10)}
          testId="draw"
        />,
      );
      expect(
        screen.getByTestId("draw").querySelectorAll("polygon").length,
      ).toBeGreaterThan(0);
    });

    it("draws no ring when the pointer is at the circle's centre", async () => {
      const draft = { ...CIRCLE, radiusMetres: undefined, done: false };
      await renderOverlay(
        <DrawOverlay
          shapes={[draft]}
          selection={null}
          hover={p(20, 10)}
          testId="draw"
        />,
      );
      expect(
        screen.getByTestId("draw").querySelectorAll("polygon"),
      ).toHaveLength(0);
    });

    it("draws no preview without a pointer or without a shape being drawn", async () => {
      await renderOverlay(
        <DrawOverlay
          shapes={[POLYGON]}
          selection={null}
          hover={p(21, 11)}
          testId="draw"
        />,
      );
      expect(
        screen.getByTestId("draw").querySelectorAll("polyline"),
      ).toHaveLength(0);
    });
  });
});

describe("DrawOverlay on a globe", () => {
  const FAR = p(-160, -10);

  function globeServices(): FakeServices {
    const services = createFakeServices();
    services.fakes.settings.set({ projection: "globe" });
    return services;
  }

  it("leaves out a point on the far side and draws no line wholly there", async () => {
    await renderOverlay(
      <DrawOverlay
        shapes={[
          POINT,
          { ...POINT, id: "far-point", vertices: [FAR] },
          { ...LINE, id: "far-line", vertices: [FAR, p(-159, -9)] },
        ]}
        selection={null}
      />,
      globeServices(),
    );
    expect(shapesIn().map((el) => el.getAttribute("data-shape-id"))).toEqual([
      "shape-3",
      "far-line",
    ]);
    expect(
      shapesIn().find((el) => el.getAttribute("data-shape-id") === "far-line")
        ?.children,
    ).toHaveLength(0);
  });

  it("draws no fill for a polygon with a hidden vertex, only its visible edges", async () => {
    const polygon: DrawShape = {
      ...POLYGON,
      vertices: [p(20, 10), p(21, 10), FAR],
    };
    await renderOverlay(
      <DrawOverlay shapes={[polygon]} selection={null} />,
      globeServices(),
    );
    const [shape] = shapesIn();
    expect(shape?.querySelector("polygon")).toBeNull();
    expect(shape?.querySelectorAll("polyline").length).toBeGreaterThan(0);
  });

  it("draws only the handles on the near side", async () => {
    const shape: DrawShape = {
      ...POLYGON,
      vertices: [p(20, 10), p(21, 10), FAR],
    };
    const selection = { shapeId: shape.id, vertex: null };
    await renderOverlay(
      <DrawOverlay
        shapes={[shape]}
        selection={selection}
        handles={editHandlesFor([shape], selection)}
      />,
      globeServices(),
    );
    const kinds = screen
      .getAllByTestId("draw-handle")
      .map((el) => el.getAttribute("data-handle-id"));
    expect(kinds).toContain("shape-1:v:0");
    expect(kinds).not.toContain("shape-1:v:2");
  });

  it("bends a long edge along its great circle, the closing edge too, and fills the curved outline", async () => {
    const big: DrawShape = {
      ...POLYGON,
      vertices: [p(0, 0), p(40, 0), p(40, 40)],
    };
    await renderOverlay(
      <DrawOverlay shapes={[big]} selection={null} />,
      globeServices(),
    );
    const [shape] = shapesIn();
    const fill = shape?.querySelector("polygon")?.getAttribute("points") ?? "";
    expect(fill.split(" ").length).toBeGreaterThan(3);
  });

  it("keeps a long edge straight on a flat map", async () => {
    const big: DrawShape = {
      ...POLYGON,
      vertices: [p(0, 0), p(40, 0), p(40, 40)],
    };
    await renderOverlay(<DrawOverlay shapes={[big]} selection={null} />);
    const [shape] = shapesIn();
    const fill = shape?.querySelector("polygon")?.getAttribute("points") ?? "";
    expect(fill.split(" ")).toHaveLength(3);
  });
});

describe("DrawOverlay across the antimeridian on a flat map", () => {
  it("draws a line and its handles the short way", async () => {
    const across: DrawShape = {
      ...LINE,
      vertices: [p(170, 10), p(-170, 10)],
    };
    const selection = { shapeId: across.id, vertex: null };
    await renderOverlay(
      <DrawOverlay
        shapes={[across]}
        selection={selection}
        handles={editHandlesFor([across], selection)}
      />,
    );
    const xs = (
      shapesIn()[0]?.querySelectorAll("polyline")[1]?.getAttribute("points") ??
      ""
    )
      .split(" ")
      .map((pair) => Number(pair.split(",")[0]));
    // Twenty degrees east at zoom 6, where the world is 16,384 pixels wide.
    const width = (16_384 * 20) / 360;
    expect(xs).toHaveLength(2);
    expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBeCloseTo(width, 1);
    const handles = screen
      .getAllByTestId("draw-handle")
      .map((handle) => Number(handle.getAttribute("cx")));
    expect(handles).toHaveLength(3);
    for (const x of handles) {
      expect(x).toBeGreaterThanOrEqual((xs[0] ?? 0) - 0.01);
      expect(x).toBeLessThanOrEqual((xs[1] ?? 0) + 0.01);
    }
  });
});
