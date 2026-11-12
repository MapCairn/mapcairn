// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type FakeServices,
  type LayerDefinition,
  LayerError,
  type LayerFeature,
  queryWindow,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_QUERY_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { type UseDataLayersOptions, useDataLayers } from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 9, 12);
const AREA = { west: 2.2, south: 48.8, east: 2.5, north: 48.95 };
const OTHER_AREA = { west: 9, south: 40, east: 9.3, north: 40.15 };
const THIRD_AREA = { west: 20, south: 10, east: 20.3, north: 10.15 };

/** What has been said aloud, in order. */
const said = () => announce.mock.calls.map(([message]) => message);

function setup(
  options: UseDataLayersOptions = {},
  definitions: readonly LayerDefinition[] = SAMPLE_LAYERS,
) {
  const services: FakeServices = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW, ...options }), {
    wrapper,
  });
  return { ...view, source: services.fakes.layerSource, services };
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

/** A load the test settles by hand, whatever the request's signal says. */
function controlledLoads(services: FakeServices) {
  const pending: {
    resolve: (features: readonly LayerFeature[]) => void;
    reject: (error: unknown) => void;
  }[] = [];
  vi.spyOn(services.layerSource, "load").mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  return pending;
}

const items = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    samplePoint(`p${index}`, { title: `Item ${index}`, value: index }),
  );

beforeEach(() => {
  announce.mockClear();
});

describe("useDataLayers loading", () => {
  describe("what is asked for", () => {
    it("loads a layer that a permalink turned on, as soon as it mounts", async () => {
      const { result, source } = setup({
        initial: { enabled: ["sample-points"], controls: {} },
      });
      source.setFeatures("sample-points", [samplePoint("a")]);
      await waitFor(() => expect(source.requests).toHaveLength(1));
      await waitFor(() =>
        expect(layer(result, "sample-points").status.kind).toBe("ready"),
      );
    });

    it("hands the source the layer, its resolved controls and the clock, and no area for a feed", async () => {
      const { result, source } = setup();
      source.setFeatures("sample-points", [samplePoint("a")]);
      act(() => result.current.setControl("sample-points", "window", "hour"));
      act(() => result.current.setEnabled("sample-points", true));
      await waitFor(() => expect(source.requests).toHaveLength(1));
      const [request] = source.requests;
      expect(request?.definition.id).toBe("sample-points");
      expect(request?.controls).toEqual({ window: "hour", small: "false" });
      expect(request?.now).toBe(NOW);
      expect(request?.signal?.aborted).toBe(false);
      expect("area" in (request ?? {})).toBe(false);
      await act(async () => {});
    });

    it("hands a query layer the window it asks for", async () => {
      const { result, source } = setup({}, [SAMPLE_QUERY_LAYER]);
      source.setFeatures("sample-query", items(1));
      act(() => result.current.setEnabled("sample-query", true));
      act(() => result.current.setView(AREA, 12));
      await waitFor(() => expect(source.requests).toHaveLength(1));
      expect(source.requests[0]?.area).toBeDefined();
      await act(async () => {});
    });

    describe("the window a query layer keeps", () => {
      /** A small pan, which stays inside the window AREA asked for. */
      const PANNED = {
        ...AREA,
        west: AREA.west + 0.02,
        east: AREA.east + 0.02,
      };
      const loadedAt = async () => {
        const loading = setup({}, [SAMPLE_QUERY_LAYER]);
        loading.source.setFeatures("sample-query", items(1));
        act(() => loading.result.current.setEnabled("sample-query", true));
        act(() => loading.result.current.setView(AREA, 12));
        await waitFor(() =>
          expect(layer(loading.result, "sample-query").status.kind).toBe(
            "ready",
          ),
        );
        act(() => loading.result.current.setView(PANNED, 12));
        expect(loading.source.requests).toHaveLength(1);
        return loading;
      };

      it("takes a new window for the view when it comes back from too far out", async () => {
        const { result, source } = await loadedAt();
        act(() => result.current.setView(PANNED, 3));
        act(() => result.current.setView(PANNED, 12));
        await waitFor(() => expect(source.requests).toHaveLength(2));
        expect(source.requests[1]?.area).toEqual(queryWindow(PANNED));
        expect(source.requests[1]?.area).not.toEqual(source.requests[0]?.area);
      });

      it("takes a new window for the view when it is turned off and on again", async () => {
        const { result, source } = await loadedAt();
        act(() => result.current.setEnabled("sample-query", false));
        act(() => result.current.setEnabled("sample-query", true));
        await waitFor(() => expect(source.requests).toHaveLength(2));
        expect(source.requests[1]?.area).toEqual(queryWindow(PANNED));
        expect(source.requests[1]?.area).not.toEqual(source.requests[0]?.area);
      });
    });

    it("does not load a failed layer again for an unrelated change", async () => {
      const { result, source } = setup();
      source.fail("sample-points", "network");
      source.setFeatures("sample-alerts", [samplePoint("a")]);
      act(() => result.current.setEnabled("sample-points", true));
      await waitFor(() =>
        expect(layer(result, "sample-points").status.kind).toBe("error"),
      );
      act(() => result.current.setSort("sample-points", "name"));
      act(() => result.current.setView(AREA, 12));
      act(() => result.current.setEnabled("sample-alerts", true));
      await waitFor(() =>
        expect(layer(result, "sample-alerts").status.kind).toBe("ready"),
      );
      expect(
        source.requests.filter((r) => r.definition.id === "sample-points"),
      ).toHaveLength(1);
    });

    it("cancels only the layer whose request changed", async () => {
      const { result, source } = setup();
      const release = source.hold();
      source.setFeatures("sample-points", [samplePoint("a")]);
      source.setFeatures("sample-alerts", [samplePoint("b")]);
      act(() => result.current.setEnabled("sample-points", true));
      act(() => result.current.setEnabled("sample-alerts", true));
      act(() => result.current.setControl("sample-points", "window", "hour"));
      expect(source.requests).toHaveLength(3);
      expect(source.requests[0]?.signal?.aborted).toBe(true);
      expect(source.requests[1]?.signal?.aborted).toBe(false);
      expect(source.requests[2]?.signal?.aborted).toBe(false);
      release();
      await waitFor(() =>
        expect(layer(result, "sample-alerts").status.kind).toBe("ready"),
      );
    });

    it("cancels what is in flight when the hook unmounts", async () => {
      const { result, source, unmount } = setup();
      source.hold();
      act(() => result.current.setEnabled("sample-points", true));
      unmount();
      expect(source.requests[0]?.signal?.aborted).toBe(true);
    });

    it("clears a feed layer's features while it loads again", async () => {
      const feed = setup();
      feed.source.setFeatures("sample-points", [samplePoint("a")]);
      act(() => feed.result.current.setEnabled("sample-points", true));
      await waitFor(() =>
        expect(layer(feed.result, "sample-points").features).toHaveLength(1),
      );
      feed.source.hold();
      act(() => feed.result.current.retry("sample-points"));
      expect(layer(feed.result, "sample-points")).toMatchObject({
        status: { kind: "loading" },
        features: [],
      });
    });
  });

  describe("what comes back", () => {
    it("ignores a late result for a request that a newer one replaced", async () => {
      const { result, services } = setup();
      const loads = controlledLoads(services);
      act(() => result.current.setEnabled("sample-points", true));
      act(() => result.current.setControl("sample-points", "window", "hour"));
      expect(loads).toHaveLength(2);
      await act(async () => loads[1]?.resolve([samplePoint("new")]));
      await act(async () => loads[0]?.resolve([samplePoint("old")]));
      expect(
        layer(result, "sample-points").features.map((item) => item.id),
      ).toEqual(["new"]);
    });

    it("does not say what a request that a newer one replaced found, whichever settles first", async () => {
      const { result, services } = setup();
      const loads = controlledLoads(services);
      act(() => result.current.setEnabled("sample-points", true));
      act(() => result.current.setControl("sample-points", "window", "hour"));
      await act(async () => loads[0]?.resolve([samplePoint("old")]));
      expect(said()).toEqual([]);
      await act(async () =>
        loads[1]?.resolve([samplePoint("a"), samplePoint("b")]),
      );
      expect(said()).toEqual(["Sample points: 2 shown on the map."]);
    });

    it("does not say what a request for a layer turned off meanwhile found", async () => {
      const { result, services } = setup();
      const loads = controlledLoads(services);
      act(() => result.current.setEnabled("sample-points", true));
      act(() => result.current.setEnabled("sample-points", false));
      await act(async () => loads[0]?.resolve([samplePoint("old")]));
      expect(layer(result, "sample-points").status.kind).toBe("off");
      expect(said()).toEqual([]);
    });

    it("does not say what an earlier request found when the layer was turned off and on again for the same request", async () => {
      const { result, services } = setup();
      const loads = controlledLoads(services);
      act(() => result.current.setEnabled("sample-points", true));
      act(() => result.current.setEnabled("sample-points", false));
      act(() => result.current.setEnabled("sample-points", true));
      expect(loads).toHaveLength(2);
      await act(async () => loads[0]?.resolve([samplePoint("old")]));
      expect(said()).toEqual([]);
      expect(layer(result, "sample-points").status.kind).toBe("loading");
      await act(async () => loads[1]?.resolve([samplePoint("new")]));
      expect(said()).toEqual(["Sample points: 1 shown on the map."]);
    });

    it("ignores a late failure for a layer turned off meanwhile", async () => {
      const { result, services } = setup();
      const loads = controlledLoads(services);
      act(() => result.current.setEnabled("sample-points", true));
      act(() => result.current.setEnabled("sample-points", false));
      await act(async () => loads[0]?.reject(new LayerError("network")));
      expect(layer(result, "sample-points").status.kind).toBe("off");
      expect(said()).toEqual([]);
    });

    it("ignores a request that says it was aborted, leaving the layer loading and silent", async () => {
      const { result, services } = setup();
      const loads = controlledLoads(services);
      act(() => result.current.setEnabled("sample-points", true));
      await act(async () => loads[0]?.reject(new LayerError("aborted")));
      expect(layer(result, "sample-points").status.kind).toBe("loading");
      expect(said()).toEqual([]);
    });

    it("reports an invalid response, and says so assertively", async () => {
      const { result, source } = setup();
      source.fail("sample-points", "invalid");
      act(() => result.current.setEnabled("sample-points", true));
      await waitFor(() =>
        expect(layer(result, "sample-points").status).toEqual({
          kind: "error",
          error: "invalid",
        }),
      );
      expect(announce).toHaveBeenCalledWith(
        "Sample points could not load: the provider sent something unexpected. Try again later.",
        { priority: "assertive" },
      );
    });

    it("stamps a result with the clock and clears the features of an empty feed", async () => {
      const { result } = setup();
      act(() => result.current.setEnabled("sample-points", true));
      await waitFor(() =>
        expect(layer(result, "sample-points").status).toEqual({
          kind: "empty",
          updatedAt: NOW,
        }),
      );
      expect(layer(result, "sample-points").features).toEqual([]);
      expect(announce).toHaveBeenCalledWith(
        "Sample points: No sample points right now.",
        { priority: "polite" },
      );
    });
  });

  describe("what is said aloud", () => {
    it("says a feed layer's result each time it loads", async () => {
      const { result, source } = setup();
      source.setFeatures("sample-alerts", [samplePoint("a")]);
      act(() => result.current.setEnabled(SAMPLE_ALERT_LAYER.id, true));
      await waitFor(() => expect(said()).toHaveLength(1));
      act(() => result.current.retry(SAMPLE_ALERT_LAYER.id));
      await waitFor(() => expect(said()).toHaveLength(2));
      expect(said()).toEqual([
        "Sample alerts: 1 shown on the map.",
        "Sample alerts: 1 shown on the map.",
      ]);
    });

    it("says a failed feed layer's failure each time it fails", async () => {
      const { result, source } = setup();
      source.fail("sample-points", "network");
      act(() => result.current.setEnabled(SAMPLE_FEED_LAYER.id, true));
      await waitFor(() => expect(said()).toHaveLength(1));
      act(() => result.current.retry(SAMPLE_FEED_LAYER.id));
      await waitFor(() => expect(said()).toHaveLength(2));
    });

    describe("a query layer", () => {
      const query = () => setup({}, [SAMPLE_QUERY_LAYER]);

      it("says what it found once, not for each window it loads", async () => {
        const { result, source } = query();
        source.setFeatures("sample-query", items(2));
        act(() => result.current.setEnabled("sample-query", true));
        act(() => result.current.setView(AREA, 12));
        await waitFor(() => expect(said()).toHaveLength(1));
        act(() => result.current.setView(OTHER_AREA, 12));
        await waitFor(() => expect(source.requests).toHaveLength(2));
        await act(async () => {});
        act(() => result.current.setView(THIRD_AREA, 12));
        await waitFor(() => expect(source.requests).toHaveLength(3));
        await act(async () => {});
        expect(said()).toEqual(["Sample query: 2 shown on the map."]);
      });

      it("says again when what it shows changes between loaded, capped and loaded", async () => {
        const { result, source } = query();
        source.setFeatures("sample-query", items(4));
        act(() => result.current.setEnabled("sample-query", true));
        act(() => result.current.setView(AREA, 12));
        await waitFor(() => expect(said()).toHaveLength(1));
        source.setFeatures("sample-query", items(2));
        act(() => result.current.setView(OTHER_AREA, 12));
        await waitFor(() => expect(said()).toHaveLength(2));
        source.setFeatures("sample-query", items(4));
        act(() => result.current.setView(THIRD_AREA, 12));
        await waitFor(() => expect(said()).toHaveLength(3));
        expect(said()).toEqual([
          "Sample query: showing the first 3. Zoom in to see more.",
          "Sample query: 2 shown on the map.",
          "Sample query: showing the first 3. Zoom in to see more.",
        ]);
      });

      it("says it is empty once, and stamps and clears the layer", async () => {
        const { result, source } = query();
        act(() => result.current.setEnabled("sample-query", true));
        act(() => result.current.setView(AREA, 12));
        await waitFor(() =>
          expect(layer(result, "sample-query").status).toEqual({
            kind: "empty",
            updatedAt: NOW,
          }),
        );
        act(() => result.current.setView(OTHER_AREA, 12));
        await waitFor(() => expect(source.requests).toHaveLength(2));
        await act(async () => {});
        expect(said()).toEqual(["Sample query: Nothing in view."]);
      });

      it("says a failure once, however often it is tried again, assertively", async () => {
        const { result, source } = query();
        source.fail("sample-query", "network");
        act(() => result.current.setEnabled("sample-query", true));
        act(() => result.current.setView(AREA, 12));
        await waitFor(() => expect(said()).toHaveLength(1));
        act(() => result.current.retry("sample-query"));
        await waitFor(() => expect(source.requests).toHaveLength(2));
        await act(async () => {});
        expect(said()).toEqual([
          "Sample query could not load. Check your connection and try again.",
        ]);
        expect(announce).toHaveBeenCalledWith(expect.any(String), {
          priority: "assertive",
        });
      });

      it("says to zoom in once while it stays out, and again after it has loaded and gone out again", async () => {
        const { result, source } = query();
        source.setFeatures("sample-query", items(1));
        act(() => result.current.setEnabled("sample-query", true));
        act(() => result.current.setView(AREA, 3));
        act(() => result.current.setView(OTHER_AREA, 2));
        expect(said()).toEqual(["Sample query: zoom in to load this layer."]);
        act(() => result.current.setView(AREA, 12));
        await waitFor(() => expect(said()).toHaveLength(2));
        act(() => result.current.setView(AREA, 3));
        expect(said()).toEqual([
          "Sample query: zoom in to load this layer.",
          "Sample query: 1 shown on the map.",
          "Sample query: zoom in to load this layer.",
        ]);
      });

      it("says to zoom in again after it was turned off and on", () => {
        const { result } = query();
        act(() => result.current.setEnabled("sample-query", true));
        act(() => result.current.setView(AREA, 3));
        act(() => result.current.setEnabled("sample-query", false));
        act(() => result.current.setEnabled("sample-query", true));
        expect(said()).toEqual([
          "Sample query: zoom in to load this layer.",
          "Sample query: zoom in to load this layer.",
        ]);
      });
    });
  });
});
