// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  type FakeServices,
  type LayerDefinition,
  LayerError,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_TIME_LAYER,
  StaticLayerRegistry,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { CLEAR_MS, THROTTLE_MS } from "../ui/LiveRegion/announcer";
import { type UseDataLayersOptions, useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;
/** Lets the announcer's throttle and clear timers run out, so a message that should not come has had its chance. */
const settleAnnouncer = () =>
  act(
    () =>
      new Promise<void>((done) =>
        setTimeout(done, THROTTLE_MS + CLEAR_MS + 50),
      ),
  );

function setup(
  options: UseDataLayersOptions = {},
  definitions: readonly LayerDefinition[] = SAMPLE_LAYERS,
) {
  const services: FakeServices = createFakeServices({
    layers: new StaticLayerRegistry(definitions),
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

  it("does not reload a loaded layer when another layer is turned on or off", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-points", [samplePoint("a")]);
    source.setFeatures("sample-alerts", [samplePoint("b")]);
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-points").status.kind).toBe("ready"),
    );
    act(() => result.current.setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").status.kind).toBe("ready"),
    );
    act(() => result.current.setEnabled("sample-alerts", false));
    expect(layer(result, "sample-points").status.kind).toBe("ready");
    expect(layer(result, "sample-points").features).toHaveLength(1);
    expect(source.requests.map((request) => request.definition.id)).toEqual([
      "sample-points",
      "sample-alerts",
    ]);
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

  it("keeps a request for the card to take focus until it is acted on, and only once", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-points", [samplePoint("a")]);
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-points").features).toHaveLength(1),
    );
    expect(result.current.focusPending).toBe(false);
    act(() => result.current.select("sample-points", "a"));
    expect(result.current.focusPending).toBe(false);
    act(() => result.current.select("sample-points", "a", { focus: true }));
    expect(result.current.focusPending).toBe(true);
    act(() => result.current.consumeFocus());
    act(() => result.current.consumeFocus());
    expect(result.current.focusPending).toBe(false);
    act(() => result.current.select("sample-points", "a", { focus: true }));
    expect(result.current.focusPending).toBe(true);
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

  describe("sorting the list", () => {
    /** The sample feed with sorts on a text field, a time and a number. */
    const sortable: LayerDefinition = {
      ...SAMPLE_FEED_LAYER,
      list: {
        ...SAMPLE_FEED_LAYER.list,
        sorts: [
          { id: "name", label: "Name", field: "title", direction: "asc" },
          { id: "seen", label: "Seen", field: "time", direction: "desc" },
          { id: "size", label: "Size", field: "value", direction: "asc" },
        ],
      },
    };

    async function sorted(
      features: ReturnType<typeof samplePoint>[],
      sortId?: string,
      definition: LayerDefinition = sortable,
    ) {
      const { result, source } = setup({}, [definition]);
      source.setFeatures("sample-points", features);
      act(() => result.current.setEnabled("sample-points", true));
      await waitFor(() =>
        expect(layer(result, "sample-points").features).toHaveLength(
          features.length,
        ),
      );
      if (sortId) {
        act(() => result.current.setSort("sample-points", sortId));
      }
      return layer(result, "sample-points").sorted.map((f) => f.id);
    }

    it("orders text alphabetically, and keeps what has no value last", async () => {
      const features = [
        samplePoint("none", { title: null }),
        samplePoint("b", { title: "Bravo" }),
        samplePoint("a", { title: "Alpha" }),
      ];
      expect(await sorted(features)).toEqual(["a", "b", "none"]);
    });

    it("orders readable times as times, not as text, and keeps what has none last when descending", async () => {
      const features = [
        samplePoint("none", {}),
        samplePoint("early", { time: "2026-02-01T00:00:00Z" }),
        samplePoint("late", { time: "2026-11-01T00:00:00Z" }),
        samplePoint("number", { time: 5 }),
      ];
      expect(await sorted(features, "seen")).toEqual([
        "late",
        "early",
        "number",
        "none",
      ]);
    });

    it("orders numbers ascending, and a value that is neither a number nor text counts as missing", async () => {
      const features = [
        samplePoint("flag", { value: true }),
        samplePoint("big", { value: 9 }),
        samplePoint("small", { value: 1 }),
        samplePoint("none", { value: null }),
      ];
      const order = await sorted(features, "size");
      expect(order.slice(0, 2)).toEqual(["small", "big"]);
      expect(new Set(order.slice(2))).toEqual(new Set(["flag", "none"]));
    });

    it("falls back to the first sort for an id the layer does not have", async () => {
      const features = [
        samplePoint("b", { title: "Bravo" }),
        samplePoint("a", { title: "Alpha" }),
      ];
      expect(await sorted(features, "unheard-of")).toEqual(["a", "b"]);
    });

    it("leaves the order alone for a layer with no sorts", async () => {
      const unsorted: LayerDefinition = {
        ...SAMPLE_FEED_LAYER,
        list: { ...SAMPLE_FEED_LAYER.list, sorts: [] },
      };
      const features = [
        samplePoint("b", { title: "Bravo" }),
        samplePoint("a", { title: "Alpha" }),
      ];
      expect(await sorted(features, undefined, unsorted)).toEqual(["b", "a"]);
    });
  });

  it("uses the system clock when it is given none", () => {
    const { result } = setup({ now: undefined });
    expect(Math.abs(result.current.now() - Date.now())).toBeLessThan(5000);
  });

  it("ignores turning on a layer twice, an unknown layer, and turning off one that is off", () => {
    const { result, source } = setup();
    act(() => result.current.setEnabled("sample-points", true));
    act(() => result.current.setEnabled("sample-points", true));
    act(() => result.current.setEnabled("not-a-layer", true));
    act(() => result.current.setEnabled("sample-alerts", false));
    expect(result.current.urlValue.enabled).toEqual(["sample-points"]);
    expect(source.requests).toHaveLength(1);
  });

  it("keeps a layer's request going while another layer is turned on", async () => {
    const { result, source } = setup();
    const release = source.hold();
    act(() => result.current.setEnabled("sample-points", true));
    act(() => result.current.setEnabled("sample-alerts", true));
    expect(source.requests.map((request) => request.url)).toEqual([
      "https://sample.test/feed/big_day.json",
      "https://alerts.test/events",
    ]);
    expect(source.requests[0]?.signal?.aborted).toBe(false);
    release();
    await act(async () => {});
  });

  it("forgets its affected area, and stops loading it, when its layer is turned off", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e1", { area: "https://alerts.test/area" }),
    ]);
    act(() => result.current.setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").features).toHaveLength(1),
    );
    act(() => result.current.showDetail("sample-alerts", "e1"));
    expect(result.current.detail?.status).toBe("loading");
    act(() => result.current.setEnabled("sample-alerts", false));
    expect(result.current.detail).toBeNull();
    expect(source.detailRequests[0]?.signal?.aborted).toBe(true);
  });

  it("keeps the affected area of another layer when one layer is turned off", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e1", { area: "https://alerts.test/area" }),
    ]);
    act(() => result.current.setEnabled("sample-alerts", true));
    act(() => result.current.setEnabled("sample-points", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").features).toHaveLength(1),
    );
    act(() => result.current.showDetail("sample-alerts", "e1"));
    act(() => result.current.setEnabled("sample-points", false));
    expect(result.current.detail?.layerId).toBe("sample-alerts");
  });

  it("asks for no affected area for a feature or layer that is not there", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-alerts", [samplePoint("e1")]);
    act(() => result.current.setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").features).toHaveLength(1),
    );
    act(() => result.current.showDetail("sample-alerts", "missing"));
    act(() => result.current.showDetail("not-a-layer", "e1"));
    expect(result.current.detail).toBeNull();
    expect(source.detailRequests).toHaveLength(0);
  });

  it("says nothing when an affected area is given up on before it loads", async () => {
    const { result, source } = setup();
    source.setFeatures("sample-alerts", [
      samplePoint("e1", { area: "https://alerts.test/area" }),
    ]);
    act(() => result.current.setEnabled("sample-alerts", true));
    await waitFor(() =>
      expect(layer(result, "sample-alerts").features).toHaveLength(1),
    );
    const release = source.hold();
    act(() => result.current.showDetail("sample-alerts", "e1"));
    act(() => result.current.hideDetail());
    release();
    await act(async () => {});
    expect(result.current.detail).toBeNull();
    expect(
      screen.getByTestId("live-region-assertive").textContent,
    ).not.toContain("affected area");
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

  it("lists a credit shared by several layers that are on only once", () => {
    const services = createFakeServices({
      layers: new StaticLayerRegistry([
        SAMPLE_TILE_LAYER,
        { ...SAMPLE_TILE_LAYER, id: "sample-imagery-two", name: "Two" },
      ]),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>
        <LiveRegionProvider>{children}</LiveRegionProvider>
      </ServicesProvider>
    );
    const { result } = renderHook(() => useDataLayers({ now: () => NOW }), {
      wrapper,
    });
    act(() => result.current.setEnabled("sample-imagery", true));
    act(() => result.current.setEnabled("sample-imagery-two", true));
    expect(result.current.credits).toEqual(SAMPLE_TILE_LAYER.attribution);
  });

  it("fills {year} in a credit from the clock, so it is never out of date", () => {
    const dated = {
      ...SAMPLE_TILE_LAYER,
      attribution: [{ text: "Provider information {year}" }],
    };
    const services = createFakeServices({
      layers: new StaticLayerRegistry([dated]),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ServicesProvider services={services}>
        <LiveRegionProvider>{children}</LiveRegionProvider>
      </ServicesProvider>
    );
    const credits = (when: number) => {
      const { result } = renderHook(() => useDataLayers({ now: () => when }), {
        wrapper,
      });
      act(() => result.current.setEnabled(dated.id, true));
      return result.current.credits.map((credit) => credit.text);
    };
    expect(credits(Date.UTC(2026, 10, 9))).toEqual([
      "Provider information 2026",
    ]);
    expect(credits(Date.UTC(2031, 0, 1))).toEqual([
      "Provider information 2031",
    ]);
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

  describe("heatmap layers", () => {
    it("loads points like a feed and reports how many are drawn", async () => {
      const { result, source } = setup({}, [SAMPLE_HEATMAP_LAYER]);
      source.setFeatures("sample-heat", [samplePoint("a"), samplePoint("b")]);
      act(() => result.current.setEnabled("sample-heat", true));
      await waitFor(() =>
        expect(layer(result, "sample-heat").status).toMatchObject({
          kind: "ready",
          count: 2,
        }),
      );
      expect(layer(result, "sample-heat").controls).toEqual({
        radius: "20",
        intensity: "1",
        opacity: "0.8",
      });
      act(() => result.current.setControl("sample-heat", "radius", "40"));
      expect(layer(result, "sample-heat").controls.radius).toBe("40");
      // Tuning how it is drawn asks for nothing again.
      expect(source.requests).toHaveLength(1);
    });
  });

  describe("query layers", () => {
    const AREA = { west: 2.2, south: 48.8, east: 2.5, north: 48.95 };
    const items = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        samplePoint(`p${index}`, { title: `Item ${index}`, value: index }),
      );
    const query = (options: UseDataLayersOptions = {}) =>
      setup(options, [SAMPLE_QUERY_LAYER]);

    it("asks for nothing until it knows the view, and says it is loading", () => {
      const { result, source } = query();
      act(() => result.current.setEnabled("sample-query", true));
      expect(layer(result, "sample-query").status.kind).toBe("loading");
      expect(source.requests).toHaveLength(0);
    });

    it("asks for nothing below its zoom, and says to zoom in", () => {
      const { result, source } = query();
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 3));
      expect(layer(result, "sample-query").status).toEqual({
        kind: "zoom-in",
      });
      expect(source.requests).toHaveLength(0);
    });

    it("asks only for the window around the view, and announces the first load once", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(2));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").status).toMatchObject({
          kind: "ready",
          count: 2,
        }),
      );
      const [request] = source.requests;
      expect(request?.url).toMatch(
        /^https:\/\/query\.test\/items\?bbox=[\d.]+,[\d.]+,[\d.]+,[\d.]+&limit=4$/,
      );
      const area = request?.area;
      expect(area?.west).toBeLessThanOrEqual(AREA.west);
      expect(area?.north).toBeGreaterThanOrEqual(AREA.north);
      await waitFor(() =>
        expect(polite()).toBe("Sample query: 2 shown on the map."),
      );
    });

    it("does not ask again while the view stays inside the window", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(1));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").status.kind).toBe("ready"),
      );
      act(() =>
        result.current.setView(
          { ...AREA, west: AREA.west + 0.02, east: AREA.east + 0.02 },
          12,
        ),
      );
      expect(source.requests).toHaveLength(1);
    });

    it("keeps what is drawn while the next window loads, and shows the new one when it arrives", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(1));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").features).toHaveLength(1),
      );
      const release = source.hold();
      source.setFeatures("sample-query", items(2));
      act(() =>
        result.current.setView(
          { west: 9, south: 40, east: 9.3, north: 40.15 },
          12,
        ),
      );
      expect(layer(result, "sample-query").status.kind).toBe("loading");
      expect(layer(result, "sample-query").features).toHaveLength(1);
      release();
      await waitFor(() =>
        expect(layer(result, "sample-query").features).toHaveLength(2),
      );
      // Panning to a new window is not announced again.
      expect(polite()).toBe("Sample query: 1 shown on the map.");
    });

    it("cancels the request for a window the view has already left", async () => {
      const { result, source } = query();
      const release = source.hold();
      source.setFeatures("sample-query", items(1));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() => expect(source.requests).toHaveLength(1));
      act(() =>
        result.current.setView(
          { west: 9, south: 40, east: 9.3, north: 40.15 },
          12,
        ),
      );
      await waitFor(() => expect(source.requests).toHaveLength(2));
      expect(source.requests[0]?.signal?.aborted).toBe(true);
      expect(source.requests[1]?.signal?.aborted).toBe(false);
      release();
      await act(async () => {});
    });

    it("draws the first features up to its cap, says to zoom in, and announces it once", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(4));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").status).toMatchObject({
          kind: "ready",
          count: 3,
          capped: true,
        }),
      );
      expect(layer(result, "sample-query").features).toHaveLength(3);
      await waitFor(() =>
        expect(polite()).toBe(
          "Sample query: showing the first 3. Zoom in to see more.",
        ),
      );
    });

    it("clears the layer and says to zoom in when the view moves out below its zoom", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(1));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").status.kind).toBe("ready"),
      );
      act(() =>
        result.current.setView(
          { west: -30, south: 30, east: 30, north: 60 },
          3,
        ),
      );
      expect(layer(result, "sample-query").status).toEqual({
        kind: "zoom-in",
      });
      expect(layer(result, "sample-query").features).toEqual([]);
      await waitFor(() =>
        expect(polite()).toBe("Sample query: zoom in to load this layer."),
      );
    });

    it("keeps the open card when a refresh no longer includes its feature", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(2));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").features).toHaveLength(2),
      );
      act(() => result.current.select("sample-query", "p1"));
      source.setFeatures("sample-query", [samplePoint("other")]);
      act(() =>
        result.current.setView(
          { west: 9, south: 40, east: 9.3, north: 40.15 },
          12,
        ),
      );
      await waitFor(() =>
        expect(layer(result, "sample-query").features).toHaveLength(1),
      );
      expect(result.current.selected?.feature.id).toBe("p1");
    });

    it("forgets its window when it is turned off, and asks again when turned on", async () => {
      const { result, source } = query();
      source.setFeatures("sample-query", items(1));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").status.kind).toBe("ready"),
      );
      act(() => result.current.setEnabled("sample-query", false));
      act(() => result.current.setEnabled("sample-query", true));
      await waitFor(() => expect(source.requests).toHaveLength(2));
    });

    it("reports a failed request and loads again on retry", async () => {
      const { result, source } = query();
      source.fail("sample-query", "network");
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() =>
        expect(layer(result, "sample-query").status).toEqual({
          kind: "error",
          error: "network",
        }),
      );
      source.setFeatures("sample-query", items(1));
      act(() => result.current.retry("sample-query"));
      await waitFor(() =>
        expect(layer(result, "sample-query").status.kind).toBe("ready"),
      );
    });
  });

  describe("tile layers with no imagery", () => {
    const IMAGERY_TILES = "https://tiles.test/2026-11-08/{z}/{y}/{x}.jpg";
    const PLAIN_LAYER: LayerDefinition = {
      ...SAMPLE_TILE_LAYER,
      id: "sample-plain",
      name: "Sample plain",
      controls: [
        { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
      ],
      source: { ...SAMPLE_TILE_LAYER.source, tiles: "https://tiles.test/{z}" },
    };
    const withTime = () =>
      setup({}, [...SAMPLE_LAYERS, SAMPLE_TIME_LAYER, PLAIN_LAYER]);

    it("says no imagery was found for the chosen day, and announces it once", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-imagery", true));
      act(() =>
        result.current.reportTilesUnavailable("sample-imagery", IMAGERY_TILES),
      );
      expect(layer(result, "sample-imagery").status).toEqual({
        kind: "tiles-unavailable",
      });
      await waitFor(() =>
        expect(polite()).toBe(
          "Sample imagery: No imagery was found for 8 November 2026. Try another.",
        ),
      );
      expect(assertive()).toBe("");
    });

    it("names the UTC time a date and time control is set to", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-rain", true));
      act(() =>
        result.current.reportTilesUnavailable(
          "sample-rain",
          "https://tiles.test/rain/2026-11-09T06%3A00%3A00Z/{z}/{y}/{x}.png",
        ),
      );
      await waitFor(() =>
        expect(polite()).toBe(
          "Sample rain: No imagery was found for 06:00 UTC on 9 November 2026. Try another.",
        ),
      );
    });

    it("says only that a layer with no date or time to choose did not load", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-plain", true));
      act(() =>
        result.current.reportTilesUnavailable(
          "sample-plain",
          "https://tiles.test/{z}",
        ),
      );
      expect(layer(result, "sample-plain").status.kind).toBe(
        "tiles-unavailable",
      );
      await waitFor(() =>
        expect(polite()).toBe(
          "Sample plain: Could not load. Check your connection.",
        ),
      );
    });

    it("ignores a report for tiles the layer is no longer set to, a layer that is off, and one that has no tiles", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-imagery", true));
      act(() => result.current.setEnabled("sample-points", true));
      act(() => {
        result.current.reportTilesUnavailable(
          "sample-imagery",
          "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg",
        );
        result.current.reportTilesUnavailable("sample-rain", "any");
        result.current.reportTilesUnavailable("sample-points", "any");
        result.current.reportTilesUnavailable("nothing", "any");
      });
      await settleAnnouncer();
      expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
      expect(layer(result, "sample-rain").status).toEqual({ kind: "off" });
      expect(layer(result, "sample-points").status.kind).not.toBe(
        "tiles-unavailable",
      );
      expect(polite()).not.toContain("No imagery");
    });

    it("does not announce the same report twice", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-imagery", true));
      const report = () =>
        act(() =>
          result.current.reportTilesUnavailable(
            "sample-imagery",
            IMAGERY_TILES,
          ),
        );
      report();
      await waitFor(() => expect(polite()).toContain("No imagery"));
      act(() => result.current.setEnabled("sample-points", true));
      await waitFor(() => expect(polite()).not.toContain("No imagery"));
      report();
      await settleAnnouncer();
      expect(polite()).not.toContain("No imagery");
    });
    it("goes when a control changes the tiles, and stays when only the opacity changes", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-imagery", true));
      act(() =>
        result.current.reportTilesUnavailable("sample-imagery", IMAGERY_TILES),
      );
      act(() => result.current.setControl("sample-imagery", "opacity", "0.5"));
      expect(layer(result, "sample-imagery").status.kind).toBe(
        "tiles-unavailable",
      );
      act(() =>
        result.current.setControl("sample-imagery", "date", "2026-11-07"),
      );
      expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
      act(() =>
        result.current.setControl("sample-imagery", "date", "2026-11-08"),
      );
      expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
      act(() =>
        result.current.reportTilesUnavailable("sample-imagery", IMAGERY_TILES),
      );
      await waitFor(() =>
        expect(layer(result, "sample-imagery").status.kind).toBe(
          "tiles-unavailable",
        ),
      );
    });

    it("goes when the layer is turned off, and is announced again when it is turned back on and fails again", async () => {
      const { result } = withTime();
      act(() => result.current.setEnabled("sample-imagery", true));
      act(() =>
        result.current.reportTilesUnavailable("sample-imagery", IMAGERY_TILES),
      );
      act(() => result.current.setEnabled("sample-imagery", false));
      act(() => result.current.setEnabled("sample-imagery", true));
      expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
      act(() =>
        result.current.reportTilesUnavailable("sample-imagery", IMAGERY_TILES),
      );
      await waitFor(() => expect(polite()).toContain("No imagery"));
    });

    describe("once a tile loads", () => {
      const reportNoImagery = (result: ReturnType<typeof withTime>["result"]) =>
        act(() =>
          result.current.reportTilesUnavailable(
            "sample-imagery",
            IMAGERY_TILES,
          ),
        );

      it("clears the status of the layer that recovered and announces it once", async () => {
        const { result } = withTime();
        act(() => result.current.setEnabled("sample-imagery", true));
        reportNoImagery(result);
        await waitFor(() => expect(polite()).toContain("No imagery"));
        act(() =>
          result.current.reportTilesRecovered("sample-imagery", IMAGERY_TILES),
        );
        expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
        await waitFor(() =>
          expect(polite()).toBe("Sample imagery: imagery is showing again."),
        );
        act(() => result.current.setEnabled("sample-points", true));
        await waitFor(() => expect(polite()).not.toContain("showing again"));
        act(() =>
          result.current.reportTilesRecovered("sample-imagery", IMAGERY_TILES),
        );
        await settleAnnouncer();
        expect(polite()).not.toContain("showing again");
      });

      it("leaves another layer's status alone, and one for tiles it is no longer set to", async () => {
        const { result } = withTime();
        act(() => result.current.setEnabled("sample-imagery", true));
        act(() => result.current.setEnabled("sample-plain", true));
        reportNoImagery(result);
        act(() =>
          result.current.reportTilesUnavailable(
            "sample-plain",
            "https://tiles.test/{z}",
          ),
        );
        act(() =>
          result.current.reportTilesRecovered(
            "sample-plain",
            "https://tiles.test/{z}",
          ),
        );
        expect(layer(result, "sample-plain").status).toEqual({ kind: "on" });
        expect(layer(result, "sample-imagery").status.kind).toBe(
          "tiles-unavailable",
        );
        act(() =>
          result.current.reportTilesRecovered(
            "sample-imagery",
            "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg",
          ),
        );
        expect(layer(result, "sample-imagery").status.kind).toBe(
          "tiles-unavailable",
        );
      });

      it("says nothing for a layer that never reported no tiles, one that is off, or one that is not a tile layer", async () => {
        const { result } = withTime();
        act(() => result.current.setEnabled("sample-imagery", true));
        act(() => {
          result.current.reportTilesRecovered("sample-imagery", IMAGERY_TILES);
          result.current.reportTilesRecovered("sample-rain", "any");
          result.current.reportTilesRecovered("sample-points", "any");
          result.current.reportTilesRecovered("nothing", "any");
        });
        await settleAnnouncer();
        expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
        expect(polite()).not.toContain("showing again");
      });

      it("ignores a recovery for the old tiles after a control changed them", async () => {
        const { result } = withTime();
        act(() => result.current.setEnabled("sample-imagery", true));
        reportNoImagery(result);
        act(() =>
          result.current.setControl("sample-imagery", "date", "2026-11-07"),
        );
        await settleAnnouncer();
        act(() =>
          result.current.reportTilesRecovered("sample-imagery", IMAGERY_TILES),
        );
        await settleAnnouncer();
        expect(polite()).not.toContain("showing again");
      });

      it("shows the status again, and announces it, when a later report repeats the failure", async () => {
        const { result } = withTime();
        act(() => result.current.setEnabled("sample-imagery", true));
        reportNoImagery(result);
        act(() =>
          result.current.reportTilesRecovered("sample-imagery", IMAGERY_TILES),
        );
        reportNoImagery(result);
        expect(layer(result, "sample-imagery").status.kind).toBe(
          "tiles-unavailable",
        );
        await waitFor(() => expect(polite()).toContain("No imagery"));
        act(() =>
          result.current.reportTilesRecovered("sample-imagery", IMAGERY_TILES),
        );
        expect(layer(result, "sample-imagery").status).toEqual({ kind: "on" });
      });
    });
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
