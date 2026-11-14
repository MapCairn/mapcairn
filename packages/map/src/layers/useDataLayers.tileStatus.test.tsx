// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type FakeServices,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
  tileUrl,
} from "@mapcairn/core";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { useDataLayers } from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 9, 12);
const IMAGERY = SAMPLE_TILE_LAYER.id;
const SLOW_WORDS =
  "Sample imagery: Still waiting for imagery. The provider may be slow or not answering.";

/** What has been said aloud, in order. */
const said = () => announce.mock.calls.map(([message]) => message);

function setup() {
  const services: FakeServices = createFakeServices({
    layers: new FakeLayerCatalogue(SAMPLE_LAYERS),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW }), { wrapper });
  act(() => view.result.current.setEnabled(IMAGERY, true));
  const imagery = () =>
    view.result.current.layers.find((item) => item.definition.id === IMAGERY);
  const tiles = tileUrl(SAMPLE_TILE_LAYER, imagery()?.controls ?? {}, NOW);
  const status = () => imagery()?.status.kind;
  announce.mockClear();
  return { ...view, imagery, tiles, status };
}

describe("a tile layer that is slow", () => {
  it("shows the slow status and says it once, politely, in a message that is kept", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    expect(status()).toBe("tiles-slow");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(SLOW_WORDS, {
      priority: "polite",
      keep: true,
    });
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("ignores a report for tiles the layer is no longer set to, a layer that is off, a layer with no tiles and one that does not exist", () => {
    const { result, tiles, status } = setup();
    act(() => {
      result.current.reportTilesSlow(
        IMAGERY,
        "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg",
      );
      result.current.reportTilesSlow("sample-rain", tiles);
      result.current.reportTilesSlow("sample-points", tiles);
      result.current.reportTilesSlow("nothing", tiles);
    });
    expect(status()).toBe("on");
    expect(announce).not.toHaveBeenCalled();
  });

  it("goes when a control changes the tiles, and stays when only the opacity changes", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    act(() => result.current.setControl(IMAGERY, "opacity", "0.5"));
    expect(status()).toBe("tiles-slow");
    act(() => result.current.setControl(IMAGERY, "date", "2026-11-07"));
    expect(status()).toBe("on");
  });

  it("goes when the layer is turned off, and is said again when it is turned back on and slow again", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    act(() => result.current.setEnabled(IMAGERY, false));
    act(() => result.current.setEnabled(IMAGERY, true));
    expect(status()).toBe("on");
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    expect(status()).toBe("tiles-slow");
    expect(said().filter((message) => message === SLOW_WORDS)).toHaveLength(2);
  });

  it("clears when a tile loads, and says once that imagery is showing again", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    announce.mockClear();
    act(() => result.current.reportTilesRecovered(IMAGERY, tiles));
    expect(status()).toBe("on");
    expect(said()).toEqual(["Sample imagery: imagery is showing again."]);
    act(() => result.current.reportTilesRecovered(IMAGERY, tiles));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("ignores a recovery for tiles it is not slow for", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    announce.mockClear();
    act(() =>
      result.current.reportTilesRecovered(
        IMAGERY,
        "https://tiles.test/2026-11-07/{z}/{y}/{x}.jpg",
      ),
    );
    expect(status()).toBe("tiles-slow");
    expect(announce).not.toHaveBeenCalled();
  });

  it("becomes unavailable when the map then settles with none loaded, and is cleared by one recovery", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    announce.mockClear();
    act(() => result.current.reportTilesUnavailable(IMAGERY, tiles));
    expect(status()).toBe("tiles-unavailable");
    expect(said()).toEqual([
      "Sample imagery: No imagery was found for 8 November 2026. Try another.",
    ]);
    act(() => result.current.reportTilesRecovered(IMAGERY, tiles));
    expect(status()).toBe("on");
  });

  it("does not go back to slow once the tiles are reported unavailable", () => {
    const { result, tiles, status } = setup();
    act(() => result.current.reportTilesUnavailable(IMAGERY, tiles));
    announce.mockClear();
    act(() => result.current.reportTilesSlow(IMAGERY, tiles));
    expect(status()).toBe("tiles-unavailable");
    expect(announce).not.toHaveBeenCalled();
  });
});
