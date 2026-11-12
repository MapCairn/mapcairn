// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UNAVAILABLE_FOR_MS,
  useBasemapAvailability,
} from "./basemapAvailability";
import { ServicesProvider } from "./ServicesProvider";

function setup() {
  const services = createFakeServices();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  return renderHook(() => useBasemapAvailability(), { wrapper });
}

describe("useBasemapAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with every basemap available", () => {
    const { result } = setup();
    expect(result.current.unavailable.size).toBe(0);
  });

  it("marks a basemap unavailable, and only that one", () => {
    const { result } = setup();
    act(() => result.current.markUnavailable("osm"));
    expect([...result.current.unavailable]).toEqual(["osm"]);
  });

  it("forgets the mark after a few minutes, so a recovered provider returns without a reload", () => {
    const { result } = setup();
    act(() => result.current.markUnavailable("osm"));
    act(() => {
      vi.advanceTimersByTime(UNAVAILABLE_FOR_MS - 1);
    });
    expect(result.current.unavailable.has("osm")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.unavailable.has("osm")).toBe(false);
  });

  it("restarts the clock when a basemap is marked again", () => {
    const { result } = setup();
    act(() => result.current.markUnavailable("osm"));
    act(() => {
      vi.advanceTimersByTime(UNAVAILABLE_FOR_MS - 1000);
    });
    act(() => result.current.markUnavailable("osm"));
    act(() => {
      vi.advanceTimersByTime(UNAVAILABLE_FOR_MS - 1000);
    });
    expect(result.current.unavailable.has("osm")).toBe(true);
  });

  it("clears one basemap or all of them", () => {
    const { result } = setup();
    act(() => {
      result.current.markUnavailable("osm");
      result.current.markUnavailable("colorful");
    });
    act(() => result.current.clear("osm"));
    expect([...result.current.unavailable]).toEqual(["colorful"]);
    act(() => result.current.clear());
    expect(result.current.unavailable.size).toBe(0);
  });

  it("starts no timer for a basemap that is cleared, and none after unmount", () => {
    const { result, unmount } = setup();
    act(() => result.current.markUnavailable("osm"));
    act(() => result.current.clear("osm"));
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.markUnavailable("osm"));
    act(() => result.current.clear());
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.markUnavailable("osm"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
