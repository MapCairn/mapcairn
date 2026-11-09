import {
  createFakeServices,
  FAKE_VECTOR_BASEMAP,
  type FakeMapAdapter,
  type LatLng,
} from "@karta/core";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapView } from "../../host/MapView";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { DrawMapBindings } from "./DrawMapBindings";
import { type UseDraw, useDraw } from "./useDraw";

const VIEW = { center: { lat: 10, lng: 20 }, zoom: 6, bearing: 0 };
const p = (lng: number, lat: number): LatLng => ({ lat, lng });

let drawApi: UseDraw;

function Harness({ active }: { active: boolean }) {
  const draw = useDraw({
    units: "metric",
    active,
    getAdapter: () => null,
  });
  drawApi = draw;
  return <DrawMapBindings draw={draw} />;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount(active = true) {
  const services = createFakeServices();
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP}>
          <Harness active={active} />
        </MapView>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { ...view, adapter: services.fakes.maps[0] as FakeMapAdapter };
}

describe("DrawMapBindings", () => {
  it("gives the adapter the handles of the selected shape", async () => {
    const { adapter } = await mount();
    expect(adapter.editHandles()).toEqual([]);
    act(() => drawApi.addPoint(p(20, 10)));
    act(() => drawApi.addPoint(p(21, 10)));
    expect(adapter.editHandles().map((handle) => handle.id)).toEqual([
      "shape-1:v:0",
      "shape-1:v:1",
    ]);
  });

  it("gives it none while the tool is closed", async () => {
    const { adapter } = await mount(false);
    act(() => drawApi.addPoint(p(20, 10)));
    expect(adapter.editHandles()).toEqual([]);
  });

  it("turns a press and drag on a handle into an edit", async () => {
    const { adapter } = await mount();
    act(() => drawApi.addPoint(p(20, 10)));
    act(() => drawApi.addPoint(p(21, 10)));
    act(() => drawApi.addPoint(p(20.5, 11)));
    act(() => drawApi.finish());
    const target = p(21.5, 10.5);
    act(() => adapter.simulatePointerDown(p(21, 10)));
    act(() => adapter.simulatePointerMove(target));
    act(() => adapter.simulatePointerUp(target));
    expect(drawApi.shapes[0]?.vertices[1]?.lng).toBeCloseTo(21.5, 3);
    expect(drawApi.selection?.vertex).toBe(1);
  });

  it("follows the mouse over a handle", async () => {
    const { adapter } = await mount();
    act(() => drawApi.addPoint(p(20, 10)));
    act(() => adapter.simulatePointerMove(p(20, 10)));
    expect(drawApi.hoveredHandle).toBe("shape-1:v:0");
    act(() => adapter.simulatePointerMove(p(25, 15)));
    expect(drawApi.hoveredHandle).toBeNull();
  });

  it("takes the handles away when the map goes", async () => {
    const { adapter, unmount } = await mount();
    act(() => drawApi.addPoint(p(20, 10)));
    unmount();
    expect(adapter.editHandles()).toEqual([]);
  });
});
