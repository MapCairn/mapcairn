import {
  createFakeServices,
  type FakeServices,
  LayerError,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
  StaticLayerRegistry,
  samplePoint,
} from "@karta/core";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { type UseDataLayersOptions, useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

function setup(options: UseDataLayersOptions = {}) {
  const services: FakeServices = createFakeServices({
    layers: new StaticLayerRegistry(SAMPLE_LAYERS),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{children}</LiveRegionProvider>
    </ServicesProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW, ...options }), {
    wrapper,
  });
  return { ...view, services, source: services.fakes.layerSource };
}

function layer(
  result: { current: ReturnType<typeof useDataLayers> },
  id: string,
) {
  const found = result.current.layers.find((item) => item.definition.id === id);
  if (!found) {
    throw new Error(`No layer ${id}`);
  }
  return found;
}

describe("useDataLayers", () => {
  it("lists every registered layer, off, with its default controls, and requests nothing", () => {
    const { result, source } = setup();
    expect(result.current.layers.map((item) => item.definition.id)).toEqual(
      SAMPLE_LAYERS.map((definition) => definition.id),
    );
    expect(layer(result, "sample-points")).toMatchObject({
      enabled: false,
      status: { kind: "off" },
      controls: { window: "day", small: "false" },
    });
    expect(source.requests).toHaveLength(0);
    expect(result.current.urlValue).toEqual({ enabled: [], controls: {} });
  });

  it("loads a feed layer when it is turned on, then reports and announces what loaded", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-points", [samplePoint("a"), samplePoint("b")]);
    act(() => result.current.setEnabled("sample-points", true));
    expect(layer(result, "sample-points").status.kind).toBe("loading");
    await waitFor(() =>
      expect(layer(result, "sample-points").status).toEqual({
        kind: "ready",
        count: 2,
        updatedAt: NOW,
      }),
    );
    expect(source.requests.map((request) => request.url)).toEqual([
      "https://sample.test/feed/big_day.json",
    ]);
    await waitFor(() =>
      expect(polite()).toBe("Sample points: 2 shown on the map."),
    );
    expect(result.current.urlValue).toEqual({
      enabled: ["sample-points"],
      controls: { "sample-points": { window: "day", small: "false" } },
    });
  });

  it("reports an empty feed in the layer's own words", async () => {
    const { result } = setup();
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-points").status.kind).toBe("empty"),
    );
    await waitFor(() =>
      expect(polite()).toBe("Sample points: No sample points right now."),
    );
  });

  it("reports a failure assertively, and loads again on retry", async () => {
    const { result, source } = setup();
    source.fail("sample-points", "network");
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-points").status).toEqual({
        kind: "error",
        error: "network",
      }),
    );
    await waitFor(() =>
      expect(assertive()).toBe(
        "Sample points could not load. Check your connection and try again.",
      ),
    );
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => result.current.retry("sample-points"));
    await waitFor(() =>
      expect(layer(result, "sample-points").status.kind).toBe("ready"),
    );
    expect(source.requests).toHaveLength(2);
  });

  it("loads again with the new URL when a control changes, cancelling the old request", async () => {
    const { result, source } = setup();
    const release = source.hold();
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => result.current.setEnabled("sample-points", true));
    act(() => result.current.setControl("sample-points", "window", "hour"));
    release();
    await waitFor(() =>
      expect(layer(result, "sample-points").status.kind).toBe("ready"),
    );
    expect(source.requests.map((r) => r.url)).toEqual([
      "https://sample.test/feed/big_day.json",
      "https://sample.test/feed/all_hour.json",
    ]);
    expect(source.requests[0]?.signal?.aborted).toBe(true);
  });

  it("ignores a control value the control does not offer", () => {
    const { result } = setup();
    act(() => result.current.setControl("sample-points", "window", "year"));
    expect(layer(result, "sample-points").controls.window).toBe("day");
  });

  it("cancels the request and clears everything when a layer is turned off", async () => {
    const { result, source } = setup();
    source.hold();
    act(() => result.current.setEnabled("sample-points", true));
    act(() => result.current.setEnabled("sample-points", false));
    expect(source.requests[0]?.signal?.aborted).toBe(true);
    expect(layer(result, "sample-points")).toMatchObject({
      enabled: false,
      status: { kind: "off" },
      features: [],
    });
  });

  it("turns a tile layer on without a request and announces it", async () => {
    const { result, source } = setup();
    act(() => result.current.setEnabled("sample-imagery", true));
    expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
    expect(source.requests).toHaveLength(0);
    await waitFor(() => expect(polite()).toBe("Sample imagery is on."));
  });

  it("starts from a permalink, resolving its control values", async () => {
    const { result, source } = setup({
      initial: {
        enabled: ["sample-imagery", "unknown-layer", "sample-points"],
        controls: {
          "sample-imagery": { date: "2025-01-01", opacity: "9" },
          "sample-points": { window: "hour" },
        },
      },
    });
    source.setFeatures("sample-points", [samplePoint("a")]);
    expect(result.current.urlValue).toEqual({
      enabled: ["sample-imagery", "sample-points"],
      controls: {
        "sample-imagery": { date: "2025-01-01", opacity: "0.8" },
        "sample-points": { window: "hour", small: "false" },
      },
    });
    await waitFor(() =>
      expect(layer(result, "sample-points").status.kind).toBe("ready"),
    );
  });

  it("selects a loaded feature, and forgets it when its layer goes", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-points", [samplePoint("a"), samplePoint("b")]);
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-points").features).toHaveLength(2),
    );
    act(() => result.current.select("sample-points", "b"));
    expect(result.current.selected?.feature.id).toBe("b");
    expect(result.current.focusRequest).toBe(0);
    act(() => result.current.select("sample-points", "a", { focus: true }));
    expect(result.current.focusRequest).toBe(1);
    act(() => result.current.setEnabled("sample-points", false));
    expect(result.current.selected).toBeNull();
  });

  it("sorts the list by the layer's sort options", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-points", [
      samplePoint("old", { time: 1, value: 5 }),
      samplePoint("new", { time: 3, value: 1 }),
      samplePoint("mid", { time: 2, value: 3 }),
    ]);
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-points").features).toHaveLength(3),
    );
    expect(layer(result, "sample-points").sorted.map((f) => f.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    act(() => result.current.setSort("sample-points", "largest"));
    expect(layer(result, "sample-points").sorted.map((f) => f.id)).toEqual([
      "old",
      "mid",
      "new",
    ]);
  });

  it("loads a selected feature's affected area on request, and hides it", async () => {
    const { result, source } = setup();
    const feature = samplePoint("e1", {
      title: "Flood",
      area: "https://alerts.test/area?id=e1",
    });
    source.setFeatures("sample-alerts", [feature]);
    source.setDetail("sample-alerts", [
      {
        id: "shape",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        fields: {},
      },
    ]);
    act(() => result.current.setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").features).toHaveLength(1),
    );
    act(() => result.current.showDetail("sample-alerts", "e1"));
    expect(result.current.detail?.status).toBe("loading");
    await waitFor(() => expect(result.current.detail?.status).toBe("shown"));
    expect(result.current.detail?.shapes).toHaveLength(1);
    await waitFor(() =>
      expect(polite()).toBe("Affected area of Flood shown on the map."),
    );
    act(() => result.current.hideDetail());
    expect(result.current.detail).toBeNull();
  });

  it("reports an affected area that could not load", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e1", { area: "https://alerts.test/area" }),
    ]);
    act(() => result.current.setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").features).toHaveLength(1),
    );
    act(() => result.current.showDetail("sample-alerts", "e1"));
    await waitFor(() => expect(result.current.detail?.status).toBe("error"));
    await waitFor(() =>
      expect(assertive()).toBe("The affected area could not load. Try again."),
    );
  });

  it("collects the credits of the layers that are on", () => {
    const { result } = setup();
    expect(result.current.credits).toEqual([]);
    act(() => result.current.setEnabled("sample-imagery", true));
    expect(result.current.credits).toEqual(SAMPLE_TILE_LAYER.attribution);
  });

  it("ignores a late result for a layer turned off meanwhile", async () => {
    const { result, source } = setup();
    const release = source.hold();
    source.setFeatures(SAMPLE_FEED_LAYER.id, [samplePoint("a")]);
    act(() => result.current.setEnabled(SAMPLE_FEED_LAYER.id, true));
    act(() => result.current.setEnabled(SAMPLE_FEED_LAYER.id, false));
    release();
    await act(async () => {});
    expect(layer(result, SAMPLE_FEED_LAYER.id).status.kind).toBe("off");
  });

  it("treats an unexpected rejection as invalid", async () => {
    const { result, services } = setup();
    vi.spyOn(services.layerSource, "load").mockRejectedValue(new Error("boom"));
    act(() => result.current.setEnabled(SAMPLE_ALERT_LAYER.id, true));
    await waitFor(() =>
      expect(layer(result, SAMPLE_ALERT_LAYER.id).status).toEqual({
        kind: "error",
        error: "invalid",
      }),
    );
    expect(new LayerError("invalid").kind).toBe("invalid");
  });
});
