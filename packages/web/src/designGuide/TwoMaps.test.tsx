// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import { LiveRegionProvider, ServicesProvider } from "@mapcairn/map";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import TwoMapsRoute, { UNLABELLED_QUERY } from "../routes/design.two-maps";
import { DESIGN_GUIDE_MARKER } from "./DesignGuide";
import { TwoMaps } from "./TwoMaps";

afterEach(cleanup);

/** Lets the engines mount, so no update lands outside act. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderPage(page: React.ReactNode) {
  return render(
    <ServicesProvider services={createFakeServices()}>
      <LiveRegionProvider>{page}</LiveRegionProvider>
    </ServicesProvider>,
  );
}

describe("TwoMaps", () => {
  it("holds the page's one main landmark and names each map", async () => {
    renderPage(<TwoMaps />);
    await settle();

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Map (First)" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Map (Second)" })).toBeTruthy();
    expect(screen.getByRole("search", { name: "Search (First)" })).toBeTruthy();
  });

  it("leaves the maps unnamed when asked, so both keep the bare names", async () => {
    renderPage(<TwoMaps unlabelled />);
    await settle();

    expect(screen.getAllByRole("region", { name: "Map" })).toHaveLength(2);
  });

  it("carries the marker that keeps it out of a production build", () => {
    const { container } = renderPage(<TwoMaps />);

    expect(
      container.querySelector(`[data-design-guide="${DESIGN_GUIDE_MARKER}"]`),
    ).not.toBeNull();
  });
});

describe("the two-maps route", () => {
  async function openRoute(search: string) {
    const router = createMemoryRouter(
      [{ path: "/design/two-maps", element: <TwoMapsRoute /> }],
      { initialEntries: [`/design/two-maps${search}`] },
    );
    renderPage(<RouterProvider router={router} />);
    await settle();
    await settle();
  }

  it("labels the maps by default", async () => {
    await openRoute("");

    expect(screen.getByRole("region", { name: "Map (First)" })).toBeTruthy();
  });

  it("leaves them unlabelled with the query", async () => {
    await openRoute(`?${UNLABELLED_QUERY}`);

    expect(screen.getAllByRole("region", { name: "Map" })).toHaveLength(2);
  });
});
