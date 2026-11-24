// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices, FAKE_RASTER_BASEMAP } from "@mapcairn/core";
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Attribution } from "../chrome/Attribution";
import { EndStack } from "../chrome/EndStack";
import { FocusRegistryProvider } from "../chrome/focusRegistry";
import { MapChrome } from "../chrome/MapChrome";
import { testMapContext } from "../chrome/MapChrome/chromeTestHarness";
import { MapReadout } from "../chrome/MapReadout";
import { ServicesProvider } from "../services";
import { DirectionsPanel, useDirections } from "../tools/Directions";
import { DrawToolbar, useDraw } from "../tools/DrawToolbar";
import { MeasureToolbar, useMeasure } from "../tools/MeasureToolbar";
import { SearchPill } from "../tools/SearchPill";
import { LiveRegionProvider } from "../ui";
import { MapContext } from "./MapContext";
import { MapView } from "./MapView";

const VIEW = { center: { lat: 0, lng: 0 }, zoom: 3, bearing: 0 };
const noop = () => undefined;

/** The chrome a host puts over a map: every part that is a landmark. */
function Chrome({ background }: { readonly background: React.ReactNode }) {
  const measure = useMeasure("metric");
  const draw = useDraw({
    units: "metric",
    active: true,
    getAdapter: () => null,
  });
  return (
    <FocusRegistryProvider focusMap={noop}>
      <MapChrome
        background={background}
        modal={false}
        mainLandmark={false}
        topStart={<SearchPill onSelect={noop} />}
        endStack={
          <EndStack
            bearing={0}
            onResetBearing={noop}
            mapOptionsOpen={false}
            mapOptionsControls="sheet"
            onMapOptions={noop}
            settingsOpen={false}
            settingsControls="sheet"
            onSettings={noop}
            measuring={false}
            onMeasure={noop}
            locating={false}
            onLocate={noop}
            canZoomIn
            canZoomOut
            onZoomIn={noop}
            onZoomOut={noop}
          />
        }
        bottomStart={<MapReadout units="metric" latlng={null} />}
        bottomEnd={
          <Attribution basemap={FAKE_RASTER_BASEMAP} layerCredits={[]} />
        }
        bottomCentre={
          <>
            <MeasureToolbar
              measure={measure}
              onAddPointAtCentre={noop}
              onDone={noop}
            />
            <DrawToolbar draw={draw} onDone={noop} onOpenShapes={noop} />
          </>
        }
        sheet={null}
      />
    </FocusRegistryProvider>
  );
}

function LabelledMap({ label }: { readonly label?: string }) {
  return (
    <MapView
      initialView={VIEW}
      basemap={FAKE_RASTER_BASEMAP}
      label={label}
      chrome={(background) => <Chrome background={background} />}
    />
  );
}

async function renderMaps(labels: readonly (string | undefined)[]) {
  const view = render(
    <ServicesProvider services={createFakeServices()}>
      <LiveRegionProvider>
        {labels.map((label, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list in a test
          <LabelledMap key={index} label={label} />
        ))}
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  // Lets the engines mount, so no update lands outside act.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

/** Every landmark the chrome renders, by role and base name. */
const LANDMARKS: readonly { readonly role: string; readonly name: string }[] = [
  { role: "region", name: "Map" },
  { role: "search", name: "Search" },
  { role: "region", name: "Map tools" },
  { role: "region", name: "Map scale" },
  { role: "region", name: "Measurement" },
  { role: "region", name: "Drawing" },
  { role: "region", name: "Map credits" },
];

describe("MapView label", () => {
  it("leaves every landmark name as it is for one map with no label", async () => {
    await renderMaps([undefined]);

    for (const { role, name } of LANDMARKS) {
      expect(screen.getAllByRole(role, { name })).toHaveLength(1);
    }
  });

  it("gives each landmark of a labelled map a name that carries the label", async () => {
    await renderMaps(["Pine", "Heather"]);

    for (const { role, name } of LANDMARKS) {
      expect(
        screen.getAllByRole(role, { name: `${name} (Pine)` }),
        `${role} ${name}`,
      ).toHaveLength(1);
      expect(
        screen.getAllByRole(role, { name: `${name} (Heather)` }),
        `${role} ${name}`,
      ).toHaveLength(1);
      expect(screen.queryAllByRole(role, { name })).toHaveLength(0);
    }
  });

  it("repeats no landmark role and name across two labelled maps", async () => {
    await renderMaps(["Pine", "Heather"]);

    const seen = new Set<string>();
    for (const element of document.querySelectorAll(
      "section[aria-label], [role=search][aria-label]",
    )) {
      const key = `${element.getAttribute("role") ?? "region"} ${element.getAttribute("aria-label")}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThanOrEqual(LANDMARKS.length * 2);
  });

  it("keeps the label out of controls that are not landmarks", async () => {
    await renderMaps(["Pine"]);

    expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Measure" })).toBeTruthy();
  });

  it("generates no id twice across two maps, labelled or not", async () => {
    for (const labels of [
      ["Pine", "Heather"],
      [undefined, undefined],
    ]) {
      const { unmount } = await renderMaps(labels);
      const ids = [...document.querySelectorAll("[id]")].map(
        (element) => element.id,
      );
      expect(new Set(ids).size).toBe(ids.length);
      unmount();
    }
  });

  it("generates no id twice across two directions panels", async () => {
    function Panel() {
      return (
        <DirectionsPanel directions={useDirections("metric")} pin={null} />
      );
    }
    render(
      <ServicesProvider services={createFakeServices()}>
        <LiveRegionProvider>
          <MapContext.Provider value={testMapContext()}>
            <FocusRegistryProvider focusMap={noop}>
              <Panel />
              <Panel />
            </FocusRegistryProvider>
          </MapContext.Provider>
        </LiveRegionProvider>
      </ServicesProvider>,
    );

    const ids = [...document.querySelectorAll("[id]")].map(
      (element) => element.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      within(document.body).getAllByTestId("directions-panel"),
    ).toHaveLength(2);
  });
});

describe("MapChrome main landmark", () => {
  it("renders the map's main landmark unless the host turns it off", async () => {
    const { unmount } = render(
      <ServicesProvider services={createFakeServices()}>
        <LiveRegionProvider>
          <MapChrome background={<p>map</p>} modal={false} />
        </LiveRegionProvider>
      </ServicesProvider>,
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    unmount();

    render(
      <ServicesProvider services={createFakeServices()}>
        <LiveRegionProvider>
          <MapChrome
            background={<p>map</p>}
            modal={false}
            mainLandmark={false}
          />
        </LiveRegionProvider>
      </ServicesProvider>,
    );
    expect(screen.queryAllByRole("main")).toHaveLength(0);
    expect(screen.getByText("map")).toBeTruthy();
  });
});
