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

function renderCold() {
  const services = createFakeServices();
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
});
