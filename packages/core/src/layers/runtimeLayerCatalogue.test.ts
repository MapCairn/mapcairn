// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { runLayerCatalogueContract } from "../contracts/layerCatalogue.contract";
import { createDeferred } from "../fakes/internal";
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
} from "../fakes/layerFixtures";
import type { CatalogueState } from "../ports/layers";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { createRuntimeLayerCatalogue } from "./runtimeLayerCatalogue";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

const FAILED_NETWORK: CatalogueState = { status: "failed", reason: "network" };

runLayerCatalogueContract("createRuntimeLayerCatalogue", () => {
  const catalogue = createRuntimeLayerCatalogue({
    load: () => Promise.resolve(SAMPLE_LAYERS),
    options,
  });
  return {
    catalogue,
    controls: {
      layers: SAMPLE_LAYERS,
      settle: async () => {
        catalogue.subscribe(() => undefined);
        await catalogue.refresh();
      },
    },
  };
});

/** A catalogue whose loads a test settles, with the loads it has been asked for. */
function held() {
  const loads: ReturnType<typeof createDeferred<unknown>>[] = [];
  const signals: AbortSignal[] = [];
  const load = vi.fn((signal: AbortSignal) => {
    const deferred = createDeferred<unknown>();
    loads.push(deferred);
    signals.push(signal);
    return deferred.promise;
  });
  const onSkipped = vi.fn();
  const catalogue = createRuntimeLayerCatalogue({ load, options, onSkipped });
  return { catalogue, load, loads, signals, onSkipped };
}

const readyLayersOf = (state: CatalogueState) =>
  state.status === "ready" ? state.layers : null;

describe("createRuntimeLayerCatalogue", () => {
  it("starts loading and asks for nothing until someone subscribes", () => {
    const { catalogue, load } = held();
    expect(catalogue.getState()).toEqual({ status: "loading" });
    expect(load).not.toHaveBeenCalled();
  });

  it("loads on the first subscription, passing a signal that has not fired", () => {
    const { catalogue, load, signals } = held();
    catalogue.subscribe(() => undefined);
    expect(load).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(false);
    expect(catalogue.getState()).toEqual({ status: "loading" });
  });

  it("becomes ready with the definitions the load resolves, and tells subscribers once", async () => {
    const { catalogue, loads } = held();
    const listener = vi.fn();
    catalogue.subscribe(listener);
    loads[0]?.resolve([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]);
    await catalogue.refresh();
    expect(catalogue.getState()).toEqual({
      status: "ready",
      layers: [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
      skipped: [],
      refresh: "idle",
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is ready with no layers, not loading, when the load resolves an empty list", async () => {
    const { catalogue, loads } = held();
    catalogue.subscribe(() => undefined);
    loads[0]?.resolve([]);
    await catalogue.refresh();
    expect(catalogue.getState()).toEqual({
      status: "ready",
      layers: [],
      skipped: [],
      refresh: "idle",
    });
  });

  it("fails with network when the load rejects", async () => {
    const { catalogue, loads } = held();
    catalogue.subscribe(() => undefined);
    loads[0]?.reject(new Error("offline"));
    await catalogue.refresh();
    expect(catalogue.getState()).toEqual(FAILED_NETWORK);
  });

  it("fails with network when the load throws before it returns a promise", async () => {
    const catalogue = createRuntimeLayerCatalogue({
      load: () => {
        throw new Error("no fetch");
      },
      options,
    });
    catalogue.subscribe(() => undefined);
    await catalogue.refresh();
    expect(catalogue.getState()).toEqual(FAILED_NETWORK);
  });

  it.each([
    ["an object", { layers: [] }],
    ["text", "[]"],
    ["null", null],
    ["a number", 3],
  ])(
    "fails with invalid when the load resolves %s, not a list",
    async (_name, payload) => {
      const { catalogue, loads } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.resolve(payload);
      await catalogue.refresh();
      expect(catalogue.getState()).toEqual({
        status: "failed",
        reason: "invalid",
      });
    },
  );

  it("keeps the layers that are valid and lists the rest as skipped", async () => {
    const { catalogue, loads } = held();
    catalogue.subscribe(() => undefined);
    loads[0]?.resolve([
      SAMPLE_FEED_LAYER,
      { ...SAMPLE_TILE_LAYER, dataCost: "" },
      42,
    ]);
    await catalogue.refresh();
    const state = catalogue.getState();
    expect(readyLayersOf(state)).toEqual([SAMPLE_FEED_LAYER]);
    expect(state.status === "ready" && state.skipped).toHaveLength(2);
  });

  describe("loading once, and one at a time", () => {
    it("makes one request when a subscriber leaves and another arrives, as StrictMode does", () => {
      const { catalogue, load } = held();
      const stop = catalogue.subscribe(() => undefined);
      stop();
      catalogue.subscribe(() => undefined);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("does not abort the load when the last subscriber leaves", () => {
      const { catalogue, signals } = held();
      catalogue.subscribe(() => undefined)();
      expect(signals[0]?.aborted).toBe(false);
    });

    it("makes one request for a second subscriber while the first load is in flight", () => {
      const { catalogue, load } = held();
      catalogue.subscribe(() => undefined);
      catalogue.subscribe(() => undefined);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("does not load again on a later subscription once it has loaded", async () => {
      const { catalogue, load, loads } = held();
      catalogue.subscribe(() => undefined)();
      loads[0]?.resolve([]);
      await catalogue.refresh();
      catalogue.subscribe(() => undefined);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("returns the pending promise to a second refresh, with one request in flight", async () => {
      const { catalogue, load, loads } = held();
      catalogue.subscribe(() => undefined);
      const first = catalogue.refresh();
      const second = catalogue.refresh();
      expect(second).toBe(first);
      expect(load).toHaveBeenCalledTimes(1);
      loads[0]?.resolve([]);
      await first;
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("loads when refresh is called before anyone subscribes, and that is the one load", async () => {
      const { catalogue, load, loads } = held();
      const refreshing = catalogue.refresh();
      catalogue.subscribe(() => undefined);
      expect(load).toHaveBeenCalledTimes(1);
      loads[0]?.resolve([]);
      await refreshing;
    });
  });

  describe("refreshing", () => {
    async function readyCatalogue() {
      const harness = held();
      harness.catalogue.subscribe(() => undefined);
      harness.loads[0]?.resolve([SAMPLE_FEED_LAYER]);
      await harness.catalogue.refresh();
      return harness;
    }

    it("keeps the list and says it is loading while a refresh is in flight", async () => {
      const { catalogue, loads } = await readyCatalogue();
      const before = readyLayersOf(catalogue.getState());
      const refreshing = catalogue.refresh();
      expect(catalogue.getState()).toEqual({
        status: "ready",
        layers: [SAMPLE_FEED_LAYER],
        skipped: [],
        refresh: "loading",
      });
      loads[1]?.resolve([SAMPLE_FEED_LAYER]);
      await refreshing;
      expect(readyLayersOf(catalogue.getState())).toBe(before);
      expect(catalogue.getState()).toMatchObject({ refresh: "idle" });
    });

    it("replaces the list with the new one, reusing definitions that did not change", async () => {
      const { catalogue, loads } = await readyCatalogue();
      const [first] = readyLayersOf(catalogue.getState()) ?? [];
      const refreshing = catalogue.refresh();
      loads[1]?.resolve([
        JSON.parse(JSON.stringify(SAMPLE_FEED_LAYER)),
        SAMPLE_TILE_LAYER,
      ]);
      await refreshing;
      const layers = readyLayersOf(catalogue.getState()) ?? [];
      expect(layers).toHaveLength(2);
      expect(layers[0]).toBe(first);
    });

    it("keeps the last list and says the refresh failed when it rejects, then recovers on the next", async () => {
      const { catalogue, loads } = await readyCatalogue();
      const refreshing = catalogue.refresh();
      loads[1]?.reject(new Error("offline"));
      await refreshing;
      expect(catalogue.getState()).toEqual({
        status: "ready",
        layers: [SAMPLE_FEED_LAYER],
        skipped: [],
        refresh: "failed",
      });
      const retry = catalogue.refresh();
      loads[2]?.resolve([SAMPLE_FEED_LAYER]);
      await retry;
      expect(catalogue.getState()).toMatchObject({ refresh: "idle" });
    });

    it("keeps the last list when a refresh returns something that is not a list", async () => {
      const { catalogue, loads } = await readyCatalogue();
      const refreshing = catalogue.refresh();
      loads[1]?.resolve({ nope: true });
      await refreshing;
      expect(catalogue.getState()).toMatchObject({
        status: "ready",
        layers: [SAMPLE_FEED_LAYER],
        refresh: "failed",
      });
    });

    it("goes back to loading when it is refreshed after failing, and then ready", async () => {
      const { catalogue, loads } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.reject(new Error("offline"));
      await catalogue.refresh();
      expect(catalogue.getState()).toEqual(FAILED_NETWORK);
      const retry = catalogue.refresh();
      expect(catalogue.getState()).toEqual({ status: "loading" });
      loads[1]?.resolve([SAMPLE_FEED_LAYER]);
      await retry;
      expect(readyLayersOf(catalogue.getState())).toEqual([SAMPLE_FEED_LAYER]);
    });
  });

  describe("disposing", () => {
    it("aborts the signal the load was given", () => {
      const { catalogue, signals } = held();
      catalogue.subscribe(() => undefined);
      catalogue.dispose();
      expect(signals[0]?.aborted).toBe(true);
    });

    it("ignores a result that arrives after it, and tells nobody", async () => {
      const { catalogue, loads } = held();
      const listener = vi.fn();
      catalogue.subscribe(listener);
      const pending = catalogue.refresh();
      catalogue.dispose();
      loads[0]?.resolve([SAMPLE_FEED_LAYER]);
      await pending;
      expect(catalogue.getState()).toEqual({ status: "loading" });
      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a rejection that arrives after it, as an aborted request gives", async () => {
      const { catalogue, loads } = held();
      catalogue.subscribe(() => undefined);
      const pending = catalogue.refresh();
      catalogue.dispose();
      loads[0]?.reject(new DOMException("aborted", "AbortError"));
      await pending;
      expect(catalogue.getState()).toEqual({ status: "loading" });
    });

    it("starts no load for a refresh or a subscription afterwards", async () => {
      const { catalogue, load } = held();
      catalogue.dispose();
      catalogue.subscribe(() => undefined);
      await expect(catalogue.refresh()).resolves.toBeUndefined();
      expect(load).not.toHaveBeenCalled();
    });
  });

  describe("whatever the payload holds", () => {
    // Promises look for `then` first, so that read is left alone and the
    // rest, such as iterating the list, throws.
    const unreadableList = () =>
      new Proxy([], {
        get: (_target, key) => {
          if (key === "then") {
            return undefined;
          }
          throw new Error("unreadable");
        },
      });

    it("fails with invalid, and resolves, when the first payload cannot be read", async () => {
      const { catalogue, loads } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.resolve(unreadableList());
      await expect(catalogue.refresh()).resolves.toBeUndefined();
      expect(catalogue.getState()).toEqual({
        status: "failed",
        reason: "invalid",
      });
    });

    it("keeps the list, says the refresh failed and recovers on the next, when a later payload cannot be read", async () => {
      const { catalogue, loads } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.resolve([SAMPLE_FEED_LAYER]);
      await catalogue.refresh();
      const refreshing = catalogue.refresh();
      loads[1]?.resolve(unreadableList());
      await expect(refreshing).resolves.toBeUndefined();
      expect(catalogue.getState()).toMatchObject({
        status: "ready",
        layers: [SAMPLE_FEED_LAYER],
        refresh: "failed",
      });
      const retry = catalogue.refresh();
      loads[2]?.resolve([SAMPLE_FEED_LAYER]);
      await retry;
      expect(catalogue.getState()).toMatchObject({ refresh: "idle" });
    });

    it("stays usable when a definition holds a very deeply nested key and is refreshed again", async () => {
      const levels = 200_000;
      const nested = () =>
        JSON.parse(`${'{"a":'.repeat(levels)}1${"}".repeat(levels)}`);
      const { catalogue, loads } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.resolve([{ ...SAMPLE_FEED_LAYER, extra: nested() }]);
      await catalogue.refresh();
      const refreshing = catalogue.refresh();
      loads[1]?.resolve([{ ...SAMPLE_FEED_LAYER, extra: nested() }]);
      await expect(refreshing).resolves.toBeUndefined();
      expect(catalogue.getState()).toMatchObject({
        status: "ready",
        refresh: "idle",
      });
    });
  });

  describe("reporting skipped definitions to the host", () => {
    it("calls onSkipped with the skipped definitions when there are any", async () => {
      const { catalogue, loads, onSkipped } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.resolve([SAMPLE_FEED_LAYER, null]);
      await catalogue.refresh();
      expect(onSkipped).toHaveBeenCalledTimes(1);
      expect(onSkipped.mock.calls[0]?.[0]).toEqual([
        { problems: ["definition: must be an object"] },
      ]);
    });

    it("does not call onSkipped when every definition is valid", async () => {
      const { catalogue, loads, onSkipped } = held();
      catalogue.subscribe(() => undefined);
      loads[0]?.resolve([SAMPLE_FEED_LAYER]);
      await catalogue.refresh();
      expect(onSkipped).not.toHaveBeenCalled();
    });

    it("is ready and resolves its refresh even when onSkipped throws", async () => {
      const catalogue = createRuntimeLayerCatalogue({
        load: () => Promise.resolve([null]),
        options,
        onSkipped: () => {
          throw new Error("logging failed");
        },
      });
      catalogue.subscribe(() => undefined);
      await expect(catalogue.refresh()).resolves.toBeUndefined();
      expect(catalogue.getState().status).toBe("ready");
    });
  });
});
