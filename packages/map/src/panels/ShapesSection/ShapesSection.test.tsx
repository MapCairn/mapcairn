import {
  createFakeServices,
  type FakeServices,
  type LatLng,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { type UseDraw, useDraw } from "../../tools/DrawToolbar";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { ShapesSection } from "./ShapesSection";

const p = (lng: number, lat: number): LatLng => ({ lat, lng });
const TRIANGLE = [p(2.35, 48.85), p(2.36, 48.85), p(2.35, 48.86)];

let drawApi: UseDraw;

function Harness({ headingLevel }: { headingLevel?: 3 | 4 }) {
  const draw = useDraw({
    units: "metric",
    active: true,
    getAdapter: () => null,
  });
  drawApi = draw;
  return (
    <ShapesSection draw={draw} {...(headingLevel ? { headingLevel } : {})} />
  );
}

function renderSection(
  services: FakeServices = createFakeServices(),
  headingLevel?: 3 | 4,
) {
  render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <Harness headingLevel={headingLevel} />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return services;
}

function finishTriangle() {
  for (const point of TRIANGLE) {
    act(() => drawApi.addPoint(point));
  }
  act(() => drawApi.finish());
}

describe("ShapesSection", () => {
  it("is a region named Shapes with an h3", () => {
    renderSection();
    expect(screen.getByRole("region", { name: "Shapes" })).toBe(
      screen.getByTestId("sheet-section-shapes"),
    );
    expect(
      screen.getByRole("heading", { name: "Shapes", level: 3 }),
    ).toBeInTheDocument();
  });

  it("follows the heading level it is given", () => {
    renderSection(createFakeServices(), 4);
    expect(
      screen.getByRole("heading", { name: "Export", level: 5 }),
    ).toBeInTheDocument();
  });

  it("says nothing is drawn, and has nothing to delete", () => {
    renderSection();
    expect(screen.getByTestId("shapes-empty")).toHaveTextContent(
      "Nothing drawn yet",
    );
    expect(screen.queryByTestId("shapes-list")).toBeNull();
    expect(screen.getByTestId("shapes-delete")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByTestId("shapes-clear")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("lists each shape with its measures, marks the selected one and selects on press", () => {
    renderSection();
    finishTriangle();
    act(() => drawApi.setMode("line"));
    act(() => drawApi.addPoint(p(2.3, 48.8)));
    const list = screen.getByRole("list", { name: "Drawn shapes" });
    const rows = within(list).getAllByTestId("shapes-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Polygon 1");
    expect(rows[0]?.textContent).toMatch(/ha|m²/);
    expect(rows[1]).toHaveTextContent("Line 1, unfinished");
    fireEvent.click(within(rows[0] as HTMLElement).getByRole("button"));
    expect(drawApi.selection?.shapeId).toBe(drawApi.shapes[0]?.id);
    expect(
      within(screen.getAllByTestId("shapes-row")[0] as HTMLElement).getByRole(
        "button",
      ),
    ).toHaveAttribute("aria-current", "true");
  });

  it("deletes the selected shape, then all of them", () => {
    renderSection();
    finishTriangle();
    fireEvent.click(screen.getByTestId("shapes-delete"));
    expect(drawApi.shapes).toEqual([]);
    finishTriangle();
    fireEvent.click(screen.getByTestId("shapes-clear"));
    expect(drawApi.shapes).toEqual([]);
  });

  it("exports GeoJSON and CSV, and says what was saved", async () => {
    const services = renderSection();
    finishTriangle();
    await act(async () => {
      fireEvent.click(screen.getByTestId("shapes-export-geojson"));
    });
    expect(services.fakes.fileSaver.saved[0]?.filename).toBe(
      "mapcairn-shapes.geojson",
    );
    expect(screen.getByTestId("shapes-feedback")).toHaveTextContent(
      "Saved 1 shape as mapcairn-shapes.geojson.",
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("shapes-export-csv"));
    });
    expect(services.fakes.fileSaver.saved[1]?.filename).toBe(
      "mapcairn-shapes.csv",
    );
  });

  it("shows a failed save with its own words", async () => {
    const services = createFakeServices();
    services.fakes.fileSaver.failWith("failed");
    renderSection(services);
    finishTriangle();
    await act(async () => {
      fireEvent.click(screen.getByTestId("shapes-export-geojson"));
    });
    expect(screen.getByTestId("shapes-feedback")).toHaveTextContent(
      "could not be saved",
    );
  });

  it("copies a link with the shapes", async () => {
    const services = renderSection();
    finishTriangle();
    await act(async () => {
      fireEvent.click(screen.getByTestId("shapes-copy-link"));
    });
    expect(services.fakes.clipboard.written[0]).toContain("shapes=");
    expect(screen.getByTestId("shapes-feedback")).toHaveTextContent(
      "Link with shapes copied.",
    );
  });

  it("says plainly that nothing is stored and what a link holds", () => {
    renderSection();
    expect(screen.getByText(/not saved/)).toBeInTheDocument();
    expect(screen.getByText(/holds them in its address/)).toBeInTheDocument();
  });
});
