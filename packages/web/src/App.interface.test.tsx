// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices, EN_GB_CATALOGUE } from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import { act, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { MAP_REGION_ID } from "./app/initialView";
import type { useMapApp } from "./app/useMapApp";

/**
 * Where the part of the interface that is fetched apart stands, as the test
 * says. `arrived` is the real definition, which the test setup has loaded.
 */
const load = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const control = {
    status: "loading" as "loading" | "ready" | "failed",
    listeners,
    settle(status: "ready" | "failed"): void {
      control.status = status;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return control;
});

// Named by path, not imported, so this package compiles only its own sources.
vi.mock("../../map/src/lit/privateElements", async (importOriginal) => {
  const original = await importOriginal<{
    privateElements: { state: () => unknown };
  }>();
  const waiting = { status: "loading" };
  const failed = { status: "failed" };
  return {
    ...original,
    privateElements: {
      define: () => Promise.resolve(),
      state: () => {
        if (load.status === "ready") {
          return original.privateElements.state();
        }
        return load.status === "failed" ? failed : waiting;
      },
      subscribe: (listener: () => void) => {
        load.listeners.add(listener);
        return () => load.listeners.delete(listener);
      },
    },
  };
});

/** What the app last held, read through the real hook. */
const held = vi.hoisted(() => ({
  app: undefined as ReturnType<typeof useMapApp> | undefined,
}));

vi.mock("./app/useMapApp", async (importOriginal) => {
  const original = await importOriginal<typeof import("./app/useMapApp")>();
  return {
    ...original,
    useMapApp: () => {
      held.app = original.useMapApp();
      return held.app;
    },
  };
});

const mapRegions = () => document.querySelectorAll(`[id="${MAP_REGION_ID}"]`);

function renderCold(services = createFakeServices()) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <ServicesProvider services={services}>
          <LiveRegionProvider>
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </LiveRegionProvider>
        </ServicesProvider>
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return services;
}

describe("the map app while its interface loads", () => {
  afterEach(() => {
    load.status = "loading";
    vi.restoreAllMocks();
  });

  it("keeps the placeholder over the wait and drops it once the interface is drawn", async () => {
    renderCold();
    expect(screen.getByTestId("map-placeholder")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByTestId("chrome-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("map-host")).toBeNull();

    await act(async () => load.settle("ready"));

    expect(await screen.findByTestId("map-host")).toBeInTheDocument();
    expect(screen.queryByTestId("map-placeholder")).toBeNull();
    expect(document.querySelectorAll("main")).toHaveLength(1);
  });

  it("drops the placeholder for the notice when the interface cannot load", async () => {
    const services = renderCold();

    await act(async () => load.settle("failed"));

    expect(await screen.findByTestId("map-host")).toHaveTextContent(
      EN_GB_CATALOGUE["app.banner.engineFailed"],
    );
    expect(screen.queryByTestId("map-placeholder")).toBeNull();
    expect(services.fakes.maps).toHaveLength(0);
  });

  it("keeps one main landmark, and one element with the map's id, around the notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderCold();

    await act(async () => load.settle("failed"));

    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContainElement(screen.getByTestId("map-host"));
    expect(mapRegions()).toHaveLength(1);
    expect(mapRegions()[0]).toBe(screen.getByTestId("map-host"));
  });

  it("blames no basemap and keeps the saved one when the interface cannot load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const services = createFakeServices();
    services.fakes.settings.set({ basemapId: "positron" });
    renderCold(services);

    await act(async () => load.settle("failed"));

    expect(held.app?.basemapFailure).toBeNull();
    expect(held.app?.basemap.id).toBe("positron");
    expect(services.fakes.settings.get().basemapId).toBe("positron");
  });
});
