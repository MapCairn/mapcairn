// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  type FakeServices,
  type LayerDefinition,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  StaticLayerRegistry,
  samplePoint,
} from "@mapcairn/core";
import { act, render, waitFor } from "@testing-library/react";
import {
  StrictMode,
  Suspense,
  startTransition,
  use,
  useEffect,
  useState,
} from "react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { type DataLayers, useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const AREA = { west: 2.2, south: 48.8, east: 2.5, north: 48.95 };
/** A view twice as wide as {@link AREA}, so it asks for a window of its own that still holds AREA. */
const WIDER_AREA = { west: 2.0, south: 48.65, east: 2.6, north: 49.1 };
const IMAGERY_TILES = "https://tiles.test/2026-11-08/{z}/{y}/{x}.jpg";
const NEVER = new Promise<never>(() => {});

/**
 * Mounts the hook the way an app does and exposes what the last committed
 * render returned. `abandonTransition` makes a render that React throws
 * away: a transition whose render suspends and is never committed.
 */
function mount(definitions: readonly LayerDefinition[], strict = false) {
  const services: FakeServices = createFakeServices({
    layers: new StaticLayerRegistry(definitions),
  });
  const committed: { current: DataLayers | null } = { current: null };
  let abandon: () => void = () => {};
  let rerender: () => void = () => {};

  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    const [, setTick] = useState(0);
    rerender = () => setTick((tick) => tick + 1);
    const [abandoned, setAbandoned] = useState(false);
    abandon = () => setAbandoned(true);
    if (abandoned) {
      use(NEVER);
    }
    useEffect(() => {
      committed.current = layers;
    });
    return null;
  }

  const tree = (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <Suspense fallback={null}>
          <Harness />
        </Suspense>
      </LiveRegionProvider>
    </ServicesProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);

  const hook = () => {
    if (!committed.current) {
      throw new Error("Not mounted");
    }
    return committed.current;
  };
  /**
   * Runs `change` in a transition whose render suspends, so it is never
   * committed, then renders again for the state that is.
   */
  const abandonTransition = async (change: (layers: DataLayers) => void) => {
    await act(async () => {
      startTransition(() => {
        change(hook());
        abandon();
      });
    });
    await act(async () => rerender());
  };
  return {
    services,
    source: services.fakes.layerSource,
    hook,
    abandonTransition,
  };
}

describe("useDataLayers when a render is not committed", () => {
  it("asks for the same window as before under StrictMode, which renders twice", async () => {
    const { hook, source } = mount([SAMPLE_QUERY_LAYER], true);
    source.setFeatures("sample-query", [samplePoint("a")]);
    act(() => hook().setEnabled("sample-query", true));
    act(() => hook().setView(AREA, 12));
    await waitFor(() => expect(source.requests).toHaveLength(1));
    act(() => hook().setView(WIDER_AREA, 12));
    await waitFor(() => expect(source.requests).toHaveLength(2));
    await act(async () => {});
    expect(source.requests).toHaveLength(2);
  });

  it("keeps the window it asked for when a render for another view is thrown away", async () => {
    const { hook, source, abandonTransition } = mount([SAMPLE_QUERY_LAYER]);
    source.setFeatures("sample-query", [samplePoint("a")]);
    act(() => hook().setEnabled("sample-query", true));
    act(() => hook().setView(AREA, 12));
    await waitFor(() => expect(source.requests).toHaveLength(1));
    await act(async () => {});

    await abandonTransition((layers) => layers.setView(WIDER_AREA, 12));

    expect(source.requests).toHaveLength(1);
    expect(source.requests[0]?.signal?.aborted).toBe(false);
  });

  it("checks a tile report against the controls that are shown, not a render that was thrown away", async () => {
    const { hook, abandonTransition } = mount([SAMPLE_TILE_LAYER]);
    act(() => hook().setEnabled("sample-imagery", true));

    await abandonTransition((layers) =>
      layers.setControl("sample-imagery", "date", "2026-11-07"),
    );
    act(() => hook().reportTilesUnavailable("sample-imagery", IMAGERY_TILES));

    expect(hook().layers[0]?.status.kind).toBe("tiles-unavailable");
  });
});
