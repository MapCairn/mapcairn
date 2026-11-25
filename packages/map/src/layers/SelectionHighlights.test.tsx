// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

import {
  createFakeServices,
  FAKE_VECTOR_BASEMAP,
  FakeMapAdapter,
  type FakeServices,
  type LayerFeature,
  type LayerGeometry,
  SAMPLE_FEED_LAYER,
  samplePoint,
  type ViewState,
} from "@mapcairn/core";
import { contrastRatio, type ThemeName, tokenValues } from "@mapcairn/theme";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapView } from "../host/MapView";
import { MapOverlayLayer } from "../host/overlays";
import { ServicesProvider } from "../services";
import { SelectionHighlights } from "./SelectionHighlights";
import { SelectionProvider } from "./SelectionProvider";
import type { SelectedEntry } from "./selectionResolve";
import type { FeatureSelectionState } from "./useFeatureSelection";

const prepareCalls = vi.hoisted(() => ({
  bounds: vi.fn(),
  outlines: vi.fn(),
}));
vi.mock("./mapFeatures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mapFeatures")>();
  return {
    ...actual,
    featureBounds: (...args: Parameters<typeof actual.featureBounds>) => {
      prepareCalls.bounds(...args);
      return actual.featureBounds(...args);
    },
    featureOutlines: (...args: Parameters<typeof actual.featureOutlines>) => {
      prepareCalls.outlines(...args);
      return actual.featureOutlines(...args);
    },
  };
});

/** The numbers the component documents: how many features and how many vertices of each outline. */
const MAX_HIGHLIGHTED_FEATURES = 200;
const HIGHLIGHT_OUTLINE_POINTS = 100;

const VIEW: ViewState = { center: { lat: 10, lng: 20 }, zoom: 6, bearing: 0 };
const LAYER = SAMPLE_FEED_LAYER;

function shown(id: string, geometry: LayerGeometry): SelectedEntry {
  const feature: LayerFeature = {
    id,
    geometry,
    fields: { id, title: id },
  };
  return {
    status: "shown",
    ref: { layerId: LAYER.id, featureId: id },
    definition: LAYER,
    feature,
  };
}

const POINT = shown("p", samplePoint("p", {}, [20, 10]).geometry);
const POLYGON = shown("poly", {
  type: "Polygon",
  coordinates: [
    [
      [20, 10],
      [21, 10],
      [20.5, 11],
      [20, 10],
    ],
  ],
});
const LINE = shown("line", {
  type: "LineString",
  coordinates: [
    [19, 9],
    [20, 9.5],
  ],
});

function stateOf(entries: readonly SelectedEntry[]): FeatureSelectionState {
  return {
    entries,
    limit: 200,
    selecting: false,
    setSelecting: () => undefined,
    toggle: () => undefined,
    add: () => undefined,
    remove: () => undefined,
    clear: () => undefined,
  };
}

beforeEach(() => {
  prepareCalls.bounds.mockClear();
  prepareCalls.outlines.mockClear();
  // jsdom has no layout, so the fake map would be zero pixels wide and see nothing.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderHighlights(
  entries: readonly SelectedEntry[] | null,
  services: FakeServices = createFakeServices(),
) {
  const view = render(
    <ServicesProvider services={services}>
      <SelectionProvider selection={entries ? stateOf(entries) : null}>
        <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP} testId="map">
          <MapOverlayLayer testId="overlays">
            <SelectionHighlights />
          </MapOverlayLayer>
        </MapView>
      </SelectionProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { ...view, adapter: services.fakes.maps[0] as FakeMapAdapter };
}

const marks = () => screen.queryAllByTestId("selection-highlight");
const badgesIn = (mark: Element) =>
  mark.querySelectorAll('[data-part="badge"]');

describe("SelectionHighlights", () => {
  it("draws nothing when server rendered, without a store or with nothing selected", async () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <SelectionProvider selection={stateOf([POINT])}>
          <MapView initialView={VIEW} basemap={FAKE_VECTOR_BASEMAP}>
            <MapOverlayLayer>
              <SelectionHighlights />
            </MapOverlayLayer>
          </MapView>
        </SelectionProvider>
      </ServicesProvider>,
    );
    expect(html).not.toContain("selection-highlight");
    const none = await renderHighlights(null);
    expect(marks()).toHaveLength(0);
    none.unmount();
    await renderHighlights([]);
    expect(marks()).toHaveLength(0);
  });

  it("gives a point a ring and a check badge", async () => {
    await renderHighlights([POINT]);
    const [mark] = marks();
    expect(marks()).toHaveLength(1);
    expect(mark?.getAttribute("data-kind")).toBe("point");
    expect(mark?.querySelectorAll('[data-part="ring"]')).toHaveLength(1);
    expect(badgesIn(mark as Element)).toHaveLength(1);
  });

  it.each([POLYGON, LINE])(
    "gives each of a polygon and a line a dashed outline on a halo and one badge",
    async (entry) => {
      await renderHighlights([entry]);
      const [mark] = marks();
      expect(mark?.getAttribute("data-kind")).toBe("outline");
      expect(
        mark?.querySelectorAll('[data-part="halo"]').length,
      ).toBeGreaterThan(0);
      const outline = mark?.querySelectorAll('[data-part="outline"]');
      expect(outline?.length).toBeGreaterThan(0);
      expect(badgesIn(mark as Element)).toHaveLength(1);
    },
  );

  it("puts the badge of an outline on the vertex nearest the view centre", async () => {
    const { adapter } = await renderHighlights([POLYGON]);
    const centre = adapter.project(VIEW.center);
    const badge = badgesIn(marks()[0] as Element)[0] as Element;
    const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(
      badge.getAttribute("transform") ?? "",
    ) as RegExpExecArray;
    const vertices = [
      [20, 10],
      [21, 10],
      [20.5, 11],
    ].map(([lng, lat]) =>
      adapter.project({ lat: lat as number, lng: lng as number }),
    );
    const distance = (p: { x: number; y: number }) =>
      Math.hypot(p.x - centre.x, p.y - centre.y);
    const nearest = Math.min(...vertices.map(distance));
    expect(distance({ x: Number(x), y: Number(y) })).toBeCloseTo(nearest, 0);
  });

  it("leaves out references that are not shown", async () => {
    await renderHighlights([
      { status: "not-shown", ref: { layerId: "gone", featureId: "x" } },
      POINT,
    ]);
    expect(marks()).toHaveLength(1);
  });

  it("leaves out a feature whose box is out of view", async () => {
    await renderHighlights([
      shown("far", samplePoint("far", {}, [-120, -40]).geometry),
      POINT,
    ]);
    expect(marks()).toHaveLength(1);
  });

  it("draws a box that crosses the antimeridian when the view does", async () => {
    const services = createFakeServices();
    const view = { center: { lat: 0, lng: 179.9 }, zoom: 6, bearing: 0 };
    // A real engine gives the short form, with its east past 180; the fake wraps both edges.
    vi.spyOn(FakeMapAdapter.prototype, "getBounds").mockReturnValue({
      west: 171.2,
      south: -7,
      east: 188.6,
      north: 7,
    });
    render(
      <ServicesProvider services={services}>
        <SelectionProvider
          selection={stateOf([
            shown("fiji", samplePoint("fiji", {}, [-179.9, 0]).geometry),
          ])}
        >
          <MapView initialView={view} basemap={FAKE_VECTOR_BASEMAP}>
            <MapOverlayLayer>
              <SelectionHighlights />
            </MapOverlayLayer>
          </MapView>
        </SelectionProvider>
      </ServicesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(marks()).toHaveLength(1);
  });

  it("follows the map as it moves, so a feature comes into view and goes out of it", async () => {
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      queueMicrotask(() => run(0));
      return 1;
    });
    const { adapter } = await renderHighlights([
      shown("east", samplePoint("east", {}, [40, 10]).geometry),
    ]);
    expect(marks()).toHaveLength(0);
    await act(async () => adapter.setView({ center: { lat: 10, lng: 40 } }));
    expect(marks()).toHaveLength(1);
    await act(async () => adapter.setView({ center: { lat: 10, lng: 20 } }));
    expect(marks()).toHaveLength(0);
  });

  it("works out bounds and outlines once for a feature, not again as the map moves", async () => {
    const polygon = shown("fresh", {
      type: "Polygon",
      coordinates: [
        [
          [20, 10],
          [21, 10],
          [20.5, 11],
          [20, 10],
        ],
      ],
    });
    const { adapter } = await renderHighlights([polygon]);
    expect(marks()).toHaveLength(1);
    const before = [
      prepareCalls.bounds.mock.calls.length,
      prepareCalls.outlines.mock.calls.length,
    ];
    expect(before).toEqual([1, 1]);
    await act(async () =>
      adapter.setView({ center: { lat: 10.2, lng: 20.2 } }),
    );
    await act(async () =>
      adapter.setView({ center: { lat: 10.4, lng: 20.4 }, zoom: 7 }),
    );
    expect(marks()).toHaveLength(1);
    expect([
      prepareCalls.bounds.mock.calls.length,
      prepareCalls.outlines.mock.calls.length,
    ]).toEqual(before);
  });

  it("draws nothing for a feature beyond the horizon of a globe", async () => {
    const services = createFakeServices();
    services.fakes.settings.set({ projection: "globe" });
    await renderHighlights(
      [shown("far", samplePoint("far", {}, [-160, -10]).geometry)],
      services,
    );
    expect(marks()).toHaveLength(0);
  });

  it("still draws a feature on the near side of a globe", async () => {
    const services = createFakeServices();
    services.fakes.settings.set({ projection: "globe" });
    await renderHighlights([POINT], services);
    expect(marks()).toHaveLength(1);
  });

  describe("with 200 polygons", () => {
    /** A polygon of many vertices, so thinning shows in the node count. */
    function crowded(id: string, index: number): SelectedEntry {
      const lng = 19 + (index % 20) * 0.1;
      const lat = 9 + Math.floor(index / 20) * 0.1;
      const ring = Array.from({ length: 1000 }, (_, step) => {
        const angle = (step / 1000) * 2 * Math.PI;
        return [lng + Math.cos(angle) * 0.02, lat + Math.sin(angle) * 0.02] as [
          number,
          number,
        ];
      });
      return shown(id, {
        type: "Polygon",
        coordinates: [[...ring, ring[0] as [number, number]]],
      });
    }
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => crowded(`c${index}`, index));

    it("renders a bounded number of nodes, each outline thinned", async () => {
      const { container } = await renderHighlights(many(200));
      expect(marks()).toHaveLength(200);
      const points = [...container.querySelectorAll("polygon")].map(
        (el) => (el.getAttribute("points") ?? "").split(" ").length,
      );
      expect(Math.max(...points)).toBeLessThanOrEqual(HIGHLIGHT_OUTLINE_POINTS);
      // Each mark is a group holding a halo, an outline and a badge group of
      // two nodes, so the whole count is fixed by the feature count.
      const perFeature = 1 + 2 + 3;
      expect(
        container.querySelectorAll("[data-testid='overlays'] *").length,
      ).toBeLessThanOrEqual(200 * perFeature + 10);
    });

    it("draws no more than the cap when more are selected", async () => {
      await renderHighlights(many(MAX_HIGHLIGHTED_FEATURES + 30));
      expect(marks()).toHaveLength(MAX_HIGHLIGHTED_FEATURES);
    });
  });
});

describe("the highlight colours", () => {
  // The ring and the dashes are the pin colour drawn on the halo; the badge
  // disc is the pin colour with a halo edge; its tick is the halo colour on
  // the disc. Each pair clears 3:1 (the non-text minimum) in both themes.
  it.each<ThemeName>(["light", "dark"])(
    "keep the ring, the badge disc and its tick clear of what they sit on in the %s theme",
    (theme) => {
      const { mapPin, mapHalo } = tokenValues.themeValues[theme].colour;
      const pairs = {
        ringOnHalo: contrastRatio(mapPin, mapHalo),
        discEdgeAgainstDisc: contrastRatio(mapHalo, mapPin),
        tickOnDisc: contrastRatio(mapHalo, mapPin),
      };
      for (const [name, ratio] of Object.entries(pairs)) {
        expect(ratio, name).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
