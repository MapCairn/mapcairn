// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FAKE_RASTER_BASEMAP,
  message,
} from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { type Announce, LiveRegionProvider, useAnnounce } from "../ui";
import { MapView } from "./MapView";

const VIEW = { center: { lat: 0, lng: 0 }, zoom: 3, bearing: 0 };
const THROTTLE_WINDOW_MS = 1000;
const announcers: Record<string, Announce> = {};

function Capture({ name }: { readonly name: string }) {
  announcers[name] = useAnnounce();
  return null;
}

function LabelledMap({
  name,
  label,
}: {
  readonly name: string;
  readonly label?: string;
}) {
  return (
    <MapView initialView={VIEW} basemap={FAKE_RASTER_BASEMAP} label={label}>
      <Capture name={name} />
    </MapView>
  );
}

async function renderMaps(labels: Record<string, string | undefined>) {
  render(
    <ServicesProvider services={createFakeServices()}>
      <LiveRegionProvider>
        {Object.entries(labels).map(([name, label]) => (
          <LabelledMap key={name} name={name} label={label} />
        ))}
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

const polite = () => screen.getByRole("status").textContent;

describe("announcements from a labelled map", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says which of two maps an announcement came from", async () => {
    await renderMaps({ a: "Pine", b: "Heather" });

    act(() => announcers.a?.("3 results"));
    expect(polite()).toBe("Pine: 3 results");

    act(() => {
      vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
      announcers.b?.(message("announce.layerOn", { name: "Rain" }));
    });
    expect(polite()).toBe("Heather: Rain is on.");
  });

  it("prefixes an assertive announcement too", async () => {
    await renderMaps({ a: "Pine" });

    act(() => announcers.a?.("Search failed", { priority: "assertive" }));
    expect(screen.getByRole("alert").textContent).toBe("Pine: Search failed");
  });

  it("replaces a waiting message of one map with a later one of the other, unless kept", async () => {
    await renderMaps({ a: "Pine", b: "Heather" });

    act(() => announcers.a?.("First"));
    act(() => announcers.a?.("Waiting"));
    act(() => announcers.b?.("Later"));
    expect(polite()).toBe("Pine: First");
    act(() => {
      vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
    });
    expect(polite()).toBe("Heather: Later");

    act(() => {
      vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
      announcers.a?.("Kept", { keep: true });
      announcers.b?.("Kept too", { keep: true });
    });
    expect(polite()).toBe("Pine: Kept");
    act(() => {
      vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
    });
    expect(polite()).toBe("Heather: Kept too");
  });

  it("de-duplicates on the prefixed text", async () => {
    await renderMaps({ a: "Pine", b: "Heather" });

    act(() => announcers.a?.("Same"));
    expect(polite()).toBe("Pine: Same");
    act(() => {
      vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
      announcers.a?.("Same");
    });
    // The repeat inside the de-duplication window is dropped.
    expect(polite()).toBe("Pine: Same");
    act(() => {
      announcers.b?.("Same");
      vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
    });
    // The same words from the other map are a different message.
    expect(polite()).toBe("Heather: Same");
  });

  it("leaves an unlabelled map's announcements as they are", async () => {
    await renderMaps({ a: undefined });

    act(() => announcers.a?.("3 results"));
    expect(polite()).toBe("3 results");
  });
});
