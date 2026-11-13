// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices, type FakeServices } from "@mapcairn/core";
import {
  LiveRegionProvider,
  ServicesProvider,
  TooltipProvider,
} from "@mapcairn/map";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { TOUR_VERSION } from "./app/tourVersion";

// No component reads the selected set yet, so these tests put a probe where
// the map's data layers are, which is inside the provider the host mounts
// around the map and the chrome. The probe reads it the way a component will.
vi.mock("@mapcairn/map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mapcairn/map")>();
  function SelectionProbe() {
    const selection = actual.useSelection();
    if (!selection) {
      return <p data-testid="selection-probe">no selection</p>;
    }
    return (
      <>
        <p data-testid="selection-probe">
          {selection.entries.length} selected of {selection.limit}
        </p>
        <button type="button" onClick={selection.clear}>
          Clear probe
        </button>
      </>
    );
  }
  return { ...actual, MapDataLayers: SelectionProbe };
});

vi.setConfig({ testTimeout: 20_000 });

const REFERENCE = { layerId: "sample-points", featureId: "a" };

/** Lets mount and basemap promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderApp(services: FakeServices): Promise<void> {
  services.settings.set({ tourSeen: TOUR_VERSION });
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
  await settle();
}

const probe = () => screen.getByTestId("selection-probe").textContent;
const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

afterEach(cleanup);

describe("App feature selection", () => {
  it("hands the host's store down to the map and the chrome", async () => {
    const services = createFakeServices();
    await renderApp(services);
    expect(probe()).toBe("0 selected of 200");

    act(() => services.fakes.selection.replaceExternally([REFERENCE]));

    expect(probe()).toBe("1 selected of 200");
  });

  it("acts on the host's store, and says so through the app's one live region", async () => {
    const services = createFakeServices();
    services.fakes.selection.replaceExternally([REFERENCE]);
    await renderApp(services);

    fireEvent.click(screen.getByRole("button", { name: "Clear probe" }));

    expect(services.fakes.selection.getState()).toEqual([]);
    expect(polite()).toBe("Selection cleared.");
  });

  it("offers no selection, and says nothing, when the host supplies no store", async () => {
    await renderApp(createFakeServices({ selection: undefined }));

    expect(probe()).toBe("no selection");
    expect(screen.queryByRole("button", { name: "Clear probe" })).toBeNull();
    expect(polite()).toBe("");
    expect(assertive()).toBe("");
  });
});
