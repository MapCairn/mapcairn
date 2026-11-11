import { describe, expect, it } from "vitest";
import {
  initialTourState,
  shouldOfferTour,
  stepDone,
  type TourSnapshot,
  tourReducer,
} from "./tour";

const SNAPSHOT: TourSnapshot = {
  layersOn: 0,
  projection: "flat",
  surface: "none",
};

describe("tourReducer", () => {
  it("offers the welcome card only from off", () => {
    const offered = tourReducer(initialTourState, { type: "offer" });
    expect(offered).toEqual({ status: "welcome", step: 0 });
    const running = tourReducer(offered, { type: "start", steps: 3 });
    expect(tourReducer(running, { type: "offer" })).toBe(running);
  });

  it("starts at the first step, from anywhere, so Help can restart it", () => {
    const started = tourReducer(initialTourState, { type: "start", steps: 3 });
    expect(started).toEqual({ status: "running", step: 0, steps: 3 });
    const later = tourReducer(started, { type: "next" });
    expect(tourReducer(later, { type: "start", steps: 3 })).toEqual(started);
  });

  it("moves through the steps and ends after the last", () => {
    let state = tourReducer(initialTourState, { type: "start", steps: 2 });
    state = tourReducer(state, { type: "next" });
    expect(state).toEqual({ status: "running", step: 1, steps: 2 });
    state = tourReducer(state, { type: "next" });
    expect(state).toEqual({ status: "ended", step: 0 });
    expect(tourReducer(state, { type: "next" })).toBe(state);
  });

  it("ignores next while nothing is running", () => {
    expect(tourReducer(initialTourState, { type: "next" })).toBe(
      initialTourState,
    );
  });

  it("closes from any state, and closing twice changes nothing", () => {
    const welcome = tourReducer(initialTourState, { type: "offer" });
    expect(tourReducer(welcome, { type: "close" })).toEqual(initialTourState);
    expect(tourReducer(initialTourState, { type: "close" })).toBe(
      initialTourState,
    );
  });
});

describe("stepDone", () => {
  it("is done when more layers are on than when the step began", () => {
    const rule = { kind: "layer-on" } as const;
    expect(stepDone(rule, SNAPSHOT, SNAPSHOT)).toBe(false);
    expect(stepDone(rule, SNAPSHOT, { ...SNAPSHOT, layersOn: 1 })).toBe(true);
    const oneOn = { ...SNAPSHOT, layersOn: 1 };
    expect(stepDone(rule, oneOn, oneOn)).toBe(false);
    expect(stepDone(rule, oneOn, SNAPSHOT)).toBe(false);
  });

  it("is done when the map shape differs from when the step began", () => {
    const rule = { kind: "projection-changed" } as const;
    expect(stepDone(rule, SNAPSHOT, SNAPSHOT)).toBe(false);
    expect(stepDone(rule, SNAPSHOT, { ...SNAPSHOT, projection: "globe" })).toBe(
      true,
    );
  });

  it("is done when the named surface is open", () => {
    const rule = { kind: "surface", surface: "search" } as const;
    expect(stepDone(rule, SNAPSHOT, SNAPSHOT)).toBe(false);
    expect(stepDone(rule, SNAPSHOT, { ...SNAPSHOT, surface: "search" })).toBe(
      true,
    );
  });
});

describe("shouldOfferTour", () => {
  const base = { seen: null, version: 1, link: {}, persistent: true };

  it("offers the tour to a new visitor on a plain address", () => {
    expect(shouldOfferTour(base)).toBe(true);
  });

  it("does not offer a version already answered, but offers a newer one", () => {
    expect(shouldOfferTour({ ...base, seen: 1 })).toBe(false);
    expect(shouldOfferTour({ ...base, seen: 1, version: 2 })).toBe(true);
  });

  it("does not offer when nothing would be remembered", () => {
    expect(shouldOfferTour({ ...base, persistent: false })).toBe(false);
  });

  it("does not offer on a link with a view, layers or shapes, but does with only a basemap", () => {
    const view = { center: { lat: 0, lng: 0 }, zoom: 3, bearing: 0 };
    expect(shouldOfferTour({ ...base, link: { view } })).toBe(false);
    expect(
      shouldOfferTour({
        ...base,
        link: { layers: { enabled: ["quakes"], controls: {} } },
      }),
    ).toBe(false);
    expect(shouldOfferTour({ ...base, link: { shapes: "Pabc" } })).toBe(false);
    expect(shouldOfferTour({ ...base, link: { basemapId: "osm" } })).toBe(true);
  });
});
