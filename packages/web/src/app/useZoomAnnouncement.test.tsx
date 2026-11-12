// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { DEFAULT_FAKE_VIEW } from "@mapcairn/core";
import type { MapContextValue } from "@mapcairn/map";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useZoomAnnouncement,
  ZOOM_ANNOUNCE_DELAY_MS,
} from "./useZoomAnnouncement";

const announce = vi.fn();
vi.mock("@mapcairn/map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mapcairn/map")>()),
  useAnnounce: () => announce,
}));

type ZoomMap = Pick<MapContextValue, "view" | "onUserZoom">;

/** A map whose zoom the test sets and whose user zooms the test reports. */
function setup(zoom = 2) {
  const listeners = new Set<() => void>();
  const onUserZoom = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const mapAt = (level: number): ZoomMap => ({
    view: { ...DEFAULT_FAKE_VIEW, zoom: level },
    onUserZoom,
  });
  const hook = renderHook(({ map }) => useZoomAnnouncement(map), {
    initialProps: { map: mapAt(zoom) },
  });
  return {
    ...hook,
    listeners,
    /** The view reaches `level`, from any source. */
    zoomTo(level: number) {
      hook.rerender({ map: mapAt(level) });
    },
    /** The person zooms to `level` with the keys or a gesture. */
    userZoomTo(level: number) {
      act(() => {
        hook.rerender({ map: mapAt(level) });
        for (const listener of [...listeners]) {
          listener();
        }
      });
    },
  };
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  announce.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useZoomAnnouncement", () => {
  it("announces the settled level once, politely, after a pinch or wheel of several steps", () => {
    const map = setup(2);
    map.userZoomTo(2.6);
    wait(100);
    map.userZoomTo(3.4);
    wait(100);
    map.userZoomTo(4);
    wait(ZOOM_ANNOUNCE_DELAY_MS - 1);
    expect(announce).not.toHaveBeenCalled();
    wait(1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Zoom level 4");
  });

  it("announces each separate gesture once", () => {
    const map = setup(2);
    map.userZoomTo(3);
    wait(1000);
    map.userZoomTo(5);
    wait(1000);
    expect(announce.mock.calls).toEqual([["Zoom level 3"], ["Zoom level 5"]]);
  });

  it("says nothing for zooms made in code, such as a permalink or a basemap's limits", () => {
    const map = setup(2);
    map.zoomTo(7);
    wait(1000);
    map.zoomTo(4);
    wait(1000);
    expect(announce).not.toHaveBeenCalled();
  });

  it("after a zoom button, waits for the animation to settle and reads the final level", () => {
    const map = setup(2);
    act(() => {
      map.result.current();
    });
    wait(300);
    map.zoomTo(2.5);
    wait(400);
    map.zoomTo(3);
    wait(ZOOM_ANNOUNCE_DELAY_MS - 1);
    expect(announce).not.toHaveBeenCalled();
    wait(1);
    expect(announce.mock.calls).toEqual([["Zoom level 3"]]);
  });

  it("forgets a request once it is announced, so a later change in code stays silent", () => {
    const map = setup(2);
    map.userZoomTo(3);
    wait(1000);
    map.zoomTo(9);
    wait(1000);
    expect(announce.mock.calls).toEqual([["Zoom level 3"]]);
  });

  it("stops listening and drops a waiting announcement when it unmounts", () => {
    const map = setup(2);
    map.userZoomTo(3);
    map.unmount();
    expect(map.listeners.size).toBe(0);
    wait(1000);
    expect(announce).not.toHaveBeenCalled();
  });
});
