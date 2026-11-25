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

  it("leaves an unlabelled map's announcements as they are", async () => {
    await renderMaps({ a: undefined });

    act(() => announcers.a?.("3 results"));
    expect(polite()).toBe("3 results");
  });
});
