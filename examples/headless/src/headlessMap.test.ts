// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapAttributionEntry,
  buildAttribution,
  FakeMapAdapter,
  FakeMapHost,
  getBasemap,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  describeView,
  KEY_PAN_PIXELS,
  type Page,
  PLACES,
  PLACES_LAYER_ID,
  placeFeatures,
  showMap,
} from "./headlessMap";

const BRIGHT = getBasemap("bright");
if (!BRIGHT) {
  throw new Error("The built-in catalogue has no Bright basemap.");
}

/** The id of the basemap the fake draws, read from the event it emits when that basemap has no tiles. */
function drawnBasemapId(adapter: FakeMapAdapter): string | undefined {
  let id: string | undefined;
  const stop = adapter.on("basemapUnavailable", (basemap) => {
    id = basemap.id;
  });
  adapter.simulateBasemapUnavailable();
  stop();
  return id;
}

/** A page that records what it was told. */
function recordingPage() {
  const statuses: string[] = [];
  const busy: boolean[] = [];
  let credits: readonly BasemapAttributionEntry[] = [];
  const page: Page = {
    setStatus: (text) => statuses.push(text),
    setBusy: (value) => busy.push(value),
    setCredits: (entries) => {
      credits = entries;
    },
  };
  return { page, statuses, busy, credits: () => credits };
}

async function start(options: { failMount?: "webgl-unavailable" } = {}) {
  const adapter = new FakeMapAdapter(options);
  const host = new FakeMapHost();
  const recorded = recordingPage();
  const map = await showMap({
    adapter,
    host,
    page: recorded.page,
    reducedMotion: false,
  });
  return { adapter, host, map, ...recorded };
}

describe("showMap", () => {
  it("mounts the adapter on the host with the starting view and basemap", async () => {
    const { adapter } = await start();
    expect(adapter.mountCount).toBe(1);
    expect(adapter.getView().zoom).toBeGreaterThan(0);
    expect(drawnBasemapId(adapter)).toBe(BRIGHT.id);
  });

  it("shows the credits of the basemap, with the engine's own", async () => {
    const { credits } = await start();
    expect(credits().map((entry) => entry.text)).toEqual(
      expect.arrayContaining(["MapLibre"]),
    );
    expect(credits().length).toBeGreaterThan(1);
  });

  it("draws the places as one data layer", async () => {
    const { adapter } = await start();
    expect(adapter.featuresOf(PLACES_LAYER_ID)).toEqual(placeFeatures());
    expect(PLACES.length).toBeGreaterThan(0);
  });

  it("reports a tap on a place by its name", async () => {
    const { adapter, statuses } = await start();
    const place = PLACES[0];
    if (!place) {
      throw new Error("There are no places.");
    }
    adapter.simulateFeatureTap(PLACES_LAYER_ID, place.id);
    expect(statuses.at(-1)).toBe(`Selected ${place.name}.`);
  });

  it("reports the view when it stops moving", async () => {
    const { adapter, statuses } = await start();
    adapter.setView({ center: { lat: 10, lng: 20 }, zoom: 5 });
    expect(statuses.at(-1)).toBe(
      describeView({ center: { lat: 10, lng: 20 }, zoom: 5, bearing: 0 }),
    );
  });

  it("follows the map's busy state", async () => {
    const { adapter, busy } = await start();
    adapter.simulateLoading(true);
    adapter.simulateLoading(false);
    expect(busy).toEqual([true, false]);
  });

  it("says when the map stops after it loaded, and when the basemap has no tiles", async () => {
    const { adapter, statuses } = await start();
    adapter.simulateFatalError();
    expect(statuses.at(-1)).toMatch(/stopped/);
    adapter.simulateBasemapUnavailable();
    expect(statuses.at(-1)).toMatch(/basemap/i);
  });

  it("swaps the basemap by id and shows the credits of the new one", async () => {
    const { adapter, map, credits } = await start();
    await map.switchBasemap("osm");
    expect(drawnBasemapId(adapter)).toBe("osm");
    expect(credits()).toEqual(buildAttribution(getBasemap("osm") ?? BRIGHT));
  });

  it("says when the swap fails, and keeps the credits of the basemap still shown", async () => {
    const { adapter, map, credits, statuses } = await start();
    adapter.failNextBasemap();
    await map.switchBasemap("osm");
    expect(statuses.at(-1)).toMatch(/could not load/);
    expect(credits()).toEqual(buildAttribution(BRIGHT));
  });

  it("refuses a basemap id it does not know and keeps the map as it was", async () => {
    const { adapter, map } = await start();
    await expect(map.switchBasemap("nowhere")).rejects.toThrow(/nowhere/);
    expect(drawnBasemapId(adapter)).toBe(BRIGHT.id);
  });

  it("pans and zooms from the keys, and ignores any other key", async () => {
    const { adapter, map } = await start();
    const before = adapter.getView();
    expect(map.handleKey("ArrowRight")).toBe(true);
    expect(adapter.getView().center.lng).toBeGreaterThan(before.center.lng);
    expect(map.handleKey("+")).toBe(true);
    expect(adapter.getView().zoom).toBeGreaterThan(before.zoom);
    expect(map.handleKey("-")).toBe(true);
    expect(map.handleKey("q")).toBe(false);
    expect(KEY_PAN_PIXELS).toBeGreaterThan(0);
  });

  it("stops listening and destroys the adapter on destroy", async () => {
    const { adapter, map, statuses } = await start();
    map.destroy();
    const heard = statuses.length;
    adapter.simulateFatalError();
    expect(statuses.length).toBe(heard);
    expect(adapter.destroyed).toBe(true);
  });

  it("says why the engine could not start, destroys the adapter and rejects", async () => {
    const adapter = new FakeMapAdapter({ failMount: "webgl-unavailable" });
    const { page, statuses } = recordingPage();
    await expect(
      showMap({ adapter, host: new FakeMapHost(), page, reducedMotion: false }),
    ).rejects.toMatchObject({ reason: "webgl-unavailable" });
    expect(statuses.at(-1)).toMatch(/could not start/);
    expect(adapter.destroyed).toBe(true);
  });

  it("turns the map's animation off for a person who asks for less motion", async () => {
    const adapter = new FakeMapAdapter();
    await showMap({
      adapter,
      host: new FakeMapHost(),
      page: recordingPage().page,
      reducedMotion: true,
    });
    expect(adapter.animationEnabled).toBe(false);
  });
});
