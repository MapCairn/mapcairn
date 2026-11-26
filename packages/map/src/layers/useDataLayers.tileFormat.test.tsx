// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
  tileUrl,
} from "@mapcairn/core";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { useDataLayers } from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", async () => {
  const { englishAnnounce } = await import("../ui/LiveRegion/englishAnnounce");
  const speak = englishAnnounce(announce);
  return { useAnnounce: () => speak };
});

const NOW = Date.UTC(2026, 10, 9, 12);
const VECTOR = SAMPLE_VECTOR_LAYER.id;
const TILES = SAMPLE_VECTOR_LAYER.source.tiles;
const WORDS = "Sample districts: This layer's tiles are in another format.";

function setup() {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue([
      SAMPLE_FEED_LAYER,
      SAMPLE_TILE_LAYER,
      SAMPLE_VECTOR_LAYER,
    ]),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const view = renderHook(() => useDataLayers({ now: () => NOW }), { wrapper });
  act(() => view.result.current.setEnabled(VECTOR, true));
  const status = () =>
    view.result.current.layers.find((item) => item.definition.id === VECTOR)
      ?.status.kind;
  announce.mockClear();
  return { ...view, status };
}

describe("a vector tile layer whose tiles are in another format", () => {
  it("shows the format status and says it once, politely", () => {
    const { result, status } = setup();
    expect(status()).toBe("on");
    act(() => result.current.reportTilesWrongFormat(VECTOR, TILES));
    expect(status()).toBe("tiles-format");
    expect(announce).toHaveBeenCalledExactlyOnceWith(WORDS, {
      priority: "polite",
    });
    act(() => result.current.reportTilesWrongFormat(VECTOR, TILES));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("ignores a report for other tiles, a layer that is off, a layer that is not a vector layer and one that does not exist", () => {
    const { result, status } = setup();
    act(() => {
      result.current.reportTilesWrongFormat(VECTOR, "https://other.test/{z}");
      result.current.reportTilesWrongFormat(SAMPLE_FEED_LAYER.id, TILES);
      result.current.reportTilesWrongFormat(
        SAMPLE_TILE_LAYER.id,
        tileUrl(SAMPLE_TILE_LAYER, {}, NOW),
      );
      result.current.reportTilesWrongFormat("nothing", TILES);
    });
    act(() => result.current.setEnabled(VECTOR, false));
    act(() => result.current.reportTilesWrongFormat(VECTOR, TILES));
    expect(status()).toBe("off");
    expect(announce).not.toHaveBeenCalled();
  });

  it("goes when the layer is turned off, and is said again when it is on and reported again", () => {
    const { result, status } = setup();
    act(() => result.current.reportTilesWrongFormat(VECTOR, TILES));
    act(() => result.current.setEnabled(VECTOR, false));
    act(() => result.current.setEnabled(VECTOR, true));
    expect(status()).toBe("on");
    act(() => result.current.reportTilesWrongFormat(VECTOR, TILES));
    expect(status()).toBe("tiles-format");
    expect(announce).toHaveBeenCalledTimes(3);
  });
});
