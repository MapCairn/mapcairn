import {
  computeDetentHeights,
  createFakeServices,
  FakeMapAdapter,
  formatLatLng,
  type LatLng,
  MAX_DIRECTION_STOPS,
  type SearchResult,
} from "@mapcairn/core";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  renderChrome,
  testChromeLayout,
  testMapContext,
} from "../../chrome/MapChrome/chromeTestHarness";
import { DEFAULT_DIRECTIONS_NOTE, DirectionsPanel } from "./DirectionsPanel";
import { useDirections } from "./useDirections";

const PARIS: LatLng = { lat: 48.8566, lng: 2.3522 };
const NAIROBI: LatLng = { lat: -1.2921, lng: 36.8219 };

function Harness({ pin = null, note }: { pin?: LatLng | null; note?: string }) {
  const directions = useDirections("metric");
  return <DirectionsPanel directions={directions} pin={pin} note={note} />;
}

function setup(props: { pin?: LatLng | null; note?: string } = {}) {
  const services = createFakeServices();
  const view = renderChrome(<Harness {...props} />, {
    services,
    layout: testChromeLayout(),
  });
  return { ...view, services };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

function addCentreStops(count: number) {
  for (let index = 0; index < count; index += 1) {
    click("Add stop at map centre");
  }
}

describe("an empty panel", () => {
  it("explains how to add stops and asks for at least two before a route", () => {
    setup();
    expect(screen.getByText(/Tap the map to add a stop/)).toBeInTheDocument();
    expect(screen.getByTestId("directions-get-route")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByText("Add at least two stops to get a route."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("directions-stops")).toBeNull();
    expect(screen.queryByTestId("directions-clear")).toBeNull();
  });

  it("disables the travel time areas until there is a first stop", () => {
    setup();
    for (const minutes of [5, 10, 15, 30]) {
      expect(screen.getByTestId(`directions-area-${minutes}`)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  it("shows the default note, or the host's own", () => {
    const { unmount } = setup();
    expect(screen.getByTestId("directions-note")).toHaveTextContent(
      DEFAULT_DIRECTIONS_NOTE,
    );
    unmount();
    setup({ note: "Sends the stops to Example Routing." });
    expect(screen.getByTestId("directions-note")).toHaveTextContent(
      "Sends the stops to Example Routing.",
    );
  });
});

describe("adding stops", () => {
  it("adds a stop at the middle of the part of the map the sheet leaves free", () => {
    const { container } = setup();
    click("Add stop at map centre");
    const row = screen.getByTestId("directions-stop-row");
    expect(row).toHaveTextContent("Stop A:");
    expect(row.textContent).toMatch(/-?\d+\.\d{5}, -?\d+\.\d{5}/);
    expect(container).toBeTruthy();
  });

  it("offers the dropped pin only when there is one, and names the stop for it", () => {
    const { unmount } = setup();
    expect(screen.queryByTestId("directions-add-pin")).toBeNull();
    unmount();
    setup({ pin: PARIS });
    click("Add dropped pin");
    expect(screen.getByTestId("directions-stop-row")).toHaveTextContent(
      "Dropped pin",
    );
  });

  it("stops offering to add once the list is full, and says why", () => {
    setup();
    addCentreStops(MAX_DIRECTION_STOPS);
    expect(screen.getByTestId("directions-add-centre")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText(/You can add up to 10 stops/)).toBeInTheDocument();
    expect(screen.getAllByTestId("directions-stop-row")).toHaveLength(
      MAX_DIRECTION_STOPS,
    );
  });
});

describe("adding a stop by search", () => {
  const RESULT: SearchResult = {
    id: "nairobi",
    label: "Nairobi",
    secondaryLabel: "Kenya",
    centre: NAIROBI,
  };

  it("searches only when asked, then adds the chosen place under its name", async () => {
    const { services } = setup();
    services.fakes.search.setDefaultResults([RESULT]);
    const input = screen.getByTestId("directions-search-input");
    fireEvent.change(input, { target: { value: "Nairobi" } });
    expect(screen.queryByTestId("directions-search-results")).toBeNull();
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await flush();
    click("Add Nairobi, Kenya");
    expect(screen.getByTestId("directions-stop-row")).toHaveTextContent(
      "Nairobi",
    );
    expect(screen.queryByTestId("directions-search-results")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("will not search for a single character", () => {
    setup();
    fireEvent.change(screen.getByTestId("directions-search-input"), {
      target: { value: "N" },
    });
    expect(screen.getByTestId("directions-search-submit")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says when nothing matched, and when search is unavailable with a retry", async () => {
    const { services } = setup();
    const input = screen.getByTestId("directions-search-input");
    fireEvent.change(input, { target: { value: "Nowhere" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await flush();
    expect(
      screen.getByText("Nothing matched that search."),
    ).toBeInTheDocument();
    services.fakes.search.failWith("failed");
    fireEvent.change(input, { target: { value: "Nowhere again" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await flush();
    expect(
      screen.getByText("Search is unavailable right now. Please try again."),
    ).toBeInTheDocument();
    services.fakes.search.clearFailure();
    services.fakes.search.setDefaultResults([RESULT]);
    click("Retry");
    await flush();
    expect(screen.getByTestId("directions-search-result")).toBeInTheDocument();
  });
});

describe("the stop list", () => {
  it("names each button for its stop and disables the moves that go nowhere", () => {
    setup();
    addCentreStops(2);
    expect(
      screen.getByRole("button", { name: "Move stop A up" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Move stop B down" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Move stop A down" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      screen.getByRole("button", { name: "Remove stop B" }),
    ).toBeInTheDocument();
  });

  it("moves a stop to a new place and keeps its row", () => {
    setup({ pin: PARIS });
    click("Add stop at map centre");
    click("Add dropped pin");
    const rows = () => screen.getAllByTestId("directions-stop-row");
    expect(rows()[1]).toHaveTextContent("Dropped pin");
    click("Move stop B up");
    expect(rows()[0]).toHaveTextContent("Dropped pin");
    expect(rows()[0]).toHaveTextContent("Stop A:");
    click("Move stop A down");
    expect(rows()[1]).toHaveTextContent("Dropped pin");
  });

  it("removes a stop and puts focus on the Stops heading, so it is not lost", () => {
    setup();
    addCentreStops(2);
    click("Remove stop A");
    expect(screen.getAllByTestId("directions-stop-row")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Stops" })).toHaveFocus();
  });

  it("clears everything", () => {
    setup();
    addCentreStops(2);
    click("Clear directions");
    expect(screen.queryByTestId("directions-stops")).toBeNull();
    expect(screen.queryByTestId("directions-clear")).toBeNull();
  });
});

describe("getting a route", () => {
  it("shows the distance and time, and each leg when there are more than two stops", async () => {
    const { services } = setup();
    addCentreStops(3);
    click("Get route");
    expect(screen.getByTestId("directions-loading")).toHaveTextContent(
      "Finding a route...",
    );
    await flush();
    expect(services.fakes.routing.routeCalls).toHaveLength(1);
    expect(screen.getByTestId("directions-figures")).toBeInTheDocument();
    expect(screen.getAllByTestId("directions-leg")).toHaveLength(2);
    expect(screen.getAllByTestId("directions-leg")[0]).toHaveTextContent(
      /^A to B: /,
    );
  });

  it("shows no leg list for a route of two stops", async () => {
    setup();
    addCentreStops(2);
    click("Get route");
    await flush();
    expect(screen.queryByTestId("directions-leg")).toBeNull();
  });

  it("sends the chosen travel mode", async () => {
    const { services } = setup();
    addCentreStops(2);
    fireEvent.click(screen.getByRole("radio", { name: "Walk" }));
    click("Get route");
    await flush();
    expect(services.fakes.routing.routeCalls[0]?.mode).toBe("walk");
  });

  it("offers Cancel while it waits, and goes back to idle when pressed", () => {
    const { services } = setup();
    services.fakes.routing.holdNextRoute();
    addCentreStops(2);
    click("Get route");
    click("Cancel");
    expect(screen.queryByTestId("directions-loading")).toBeNull();
    expect(screen.queryByTestId("directions-cancel")).toBeNull();
  });

  it("offers Try again for a busy or unreachable service, and not for a missing route", async () => {
    const { services } = setup();
    addCentreStops(2);
    services.fakes.routing.failWith("rate-limited");
    click("Get route");
    await flush();
    const error = screen.getByTestId("directions-error");
    expect(error).toHaveTextContent("The routing service is busy");
    services.fakes.routing.clearFailure();
    click("Try again");
    await flush();
    expect(screen.queryByTestId("directions-error")).toBeNull();
    expect(screen.getByTestId("directions-result")).toBeInTheDocument();

    services.fakes.routing.failWith("no-route");
    click("Add stop at map centre");
    click("Get route");
    await flush();
    expect(screen.getByTestId("directions-error")).toHaveTextContent(
      "No route was found",
    );
    expect(screen.queryByTestId("directions-retry")).toBeNull();
  });

  it("words an unreachable service as possibly offline", async () => {
    const { services } = setup();
    addCentreStops(2);
    services.fakes.routing.failWith("network");
    click("Get route");
    await flush();
    expect(
      within(screen.getByTestId("directions-error")).getByText(/offline/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("directions-retry")).toBeInTheDocument();
  });
});

describe("a travel time area", () => {
  it("asks around the first stop and shows its size, with the chosen time pressed", async () => {
    const { services } = setup();
    addCentreStops(1);
    click("Show the area reachable within 15 minutes");
    await flush();
    expect(services.fakes.routing.reachableAreaCalls[0]?.minutes).toBe(15);
    expect(screen.getByTestId("directions-figures")).toHaveTextContent(
      "15 min driving",
    );
    expect(screen.getByTestId("directions-area").textContent).toMatch(/km²|ha/);
    expect(screen.getByTestId("directions-area-15")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("directions-area-5")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows the area's own failure wording", async () => {
    const { services } = setup();
    addCentreStops(1);
    services.fakes.routing.failWith("no-route");
    click("Show the area reachable within 5 minutes");
    await flush();
    expect(screen.getByTestId("directions-error")).toHaveTextContent(
      "Nothing is reachable",
    );
  });
});

describe("the map centre the panel uses", () => {
  it("is the middle of the part of the map the bottom sheet leaves free", () => {
    const adapter = new FakeMapAdapter();
    renderChrome(<Harness />, {
      map: testMapContext({ adapter }),
      layout: testChromeLayout({ viewport: { width: 390, height: 800 } }),
    });
    click("Add stop at map centre");
    // At the half detent the sheet covers the lower 400 px of an 800 px map.
    expect(screen.getByTestId("directions-stop-row")).toHaveTextContent(
      formatLatLng(adapter.unproject({ x: 195, y: 200 })),
    );
  });

  it("is the middle of what a bottom sheet that stands above a credit row leaves free", () => {
    const adapter = new FakeMapAdapter();
    renderChrome(<Harness />, {
      map: testMapContext({ adapter }),
      layout: testChromeLayout({
        viewport: { width: 390, height: 800 },
        bottomReserve: 56,
      }),
    });
    click("Add stop at map centre");
    const { half } = computeDetentHeights({
      viewportHeight: 800 - 56,
      insetBottom: 0,
    });
    expect(screen.getByTestId("directions-stop-row")).toHaveTextContent(
      formatLatLng(adapter.unproject({ x: 195, y: (800 - 56 - half) / 2 })),
    );
  });

  it("is beside the side panel on a wide screen", () => {
    const adapter = new FakeMapAdapter();
    renderChrome(<Harness />, {
      map: testMapContext({ adapter }),
      layout: testChromeLayout({
        layout: "panel",
        viewport: { width: 1280, height: 720 },
        panelEdge: 412,
      }),
    });
    click("Add stop at map centre");
    expect(screen.getByTestId("directions-stop-row")).toHaveTextContent(
      formatLatLng(adapter.unproject({ x: 846, y: 360 })),
    );
  });
});
