// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FAKE_VECTOR_BASEMAP,
  type FakeMapAdapter,
  type FakeServices,
} from "@mapcairn/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { MapView, type MapViewProps } from "./MapView";

const VIEW = { center: { lat: 10, lng: 20 }, zoom: 6, bearing: 0 };

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function setup(props: Partial<MapViewProps> = {}) {
  const services: FakeServices = createFakeServices();
  render(
    <ServicesProvider services={services}>
      <MapView
        initialView={VIEW}
        basemap={FAKE_VECTOR_BASEMAP}
        testId="map"
        {...props}
      />
    </ServicesProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return {
    host: screen.getByTestId("map"),
    adapter: services.fakes.maps[0] as FakeMapAdapter,
  };
}

describe("MapView key commands", () => {
  it("lets a tool take a key before the map does, and stops its default", async () => {
    const onKeyCommand = vi.fn(() => true);
    const { host, adapter } = await setup({ onKeyCommand });
    const panBy = vi.spyOn(adapter, "panBy");
    expect(fireEvent.keyDown(host, { key: "ArrowRight" })).toBe(false);
    expect(onKeyCommand).toHaveBeenCalledTimes(1);
    expect(panBy).not.toHaveBeenCalled();
  });

  it("falls back to the map's own keys when the tool does not take the key", async () => {
    const onKeyCommand = vi.fn(() => false);
    const { host, adapter } = await setup({ onKeyCommand });
    const panBy = vi.spyOn(adapter, "panBy");
    fireEvent.keyDown(host, { key: "ArrowRight" });
    expect(panBy).toHaveBeenCalledWith(80, 0);
  });

  it("does not offer a tool a key pressed in content inside the region", async () => {
    const onKeyCommand = vi.fn(() => true);
    await setup({
      onKeyCommand,
      children: <button type="button">Inside</button>,
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Inside" }), {
      key: "Enter",
    });
    expect(onKeyCommand).not.toHaveBeenCalled();
  });
});

describe("MapView key help", () => {
  it("describes the map's own keys, and adds a tool's after them", async () => {
    const { host } = await setup();
    const helpId = host.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(helpId)?.textContent).toContain(
      "Arrow keys",
    );
    expect(document.getElementById(helpId)?.textContent).not.toContain(
      "Enter:",
    );
  });

  it("includes extra lines when a tool is open", async () => {
    const { host } = await setup({
      keyHelp: [{ keys: "Enter", description: "Finish the shape" }],
    });
    const helpId = host.getAttribute("aria-describedby") ?? "";
    const text = document.getElementById(helpId)?.textContent ?? "";
    expect(text).toContain("Arrow keys: pan the map.");
    expect(text).toContain("Enter: finish the shape.");
  });

  it("keeps the map's help when the extra list is empty", async () => {
    const { host } = await setup({ keyHelp: [] });
    const helpId = host.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(helpId)?.textContent).toContain(
      "Arrow keys",
    );
  });
});

describe("MapView and handle presses", () => {
  it("cancels a pending long-press when a press starts on an edit handle", async () => {
    vi.useFakeTimers();
    try {
      const onLongPress = vi.fn();
      const { host, adapter } = await setup({ onLongPress });
      adapter.setEditHandles([
        {
          id: "v0",
          position: { lat: 10, lng: 20 },
          kind: "vertex",
        },
      ]);
      fireEvent.pointerDown(host, {
        isPrimary: true,
        pointerId: 1,
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      act(() => adapter.simulatePointerDown({ lat: 10, lng: 20 }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(onLongPress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
