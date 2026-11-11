import { createFakeServices, type TourSnapshot } from "@mapcairn/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FocusRegistryProvider, useFocusTarget } from "../../chrome";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { TourCard } from "./TourCard";
import { type TourStep, useTour } from "./useTour";

const STEPS: readonly TourStep[] = [
  {
    id: "layers",
    heading: "Turn on a layer",
    text: "Open Map options and turn on a layer.",
    advance: { kind: "layer-on" },
    target: "map-options",
    side: "end",
  },
  {
    id: "search",
    heading: "Find a place",
    text: "Type a place in Search.",
    advance: { kind: "surface", surface: "search" },
  },
];

const WELCOME = {
  heading: "New here?",
  text: "A short tour shows how.",
  announcement: "A short tour is available.",
};
const ENDING = { heading: "Tour finished", text: "Help can start it again." };

let latestStart: () => void = () => {};

function Harness({ offer }: { offer: boolean }) {
  const [snapshot, setSnapshot] = useState<TourSnapshot>({
    layersOn: 0,
    projection: "flat",
    surface: "none",
  });
  const tour = useTour({ steps: STEPS, version: 2, offer, snapshot });
  latestStart = tour.start;
  const register = useFocusTarget("map-options");
  return (
    <>
      <button type="button" ref={register}>
        Map options
      </button>
      <button
        type="button"
        onClick={() =>
          setSnapshot((current) => ({
            ...current,
            layersOn: current.layersOn + 1,
          }))
        }
      >
        Turn a layer on
      </button>
      <button
        type="button"
        onClick={() =>
          setSnapshot((current) => ({ ...current, surface: "search" }))
        }
      >
        Focus search
      </button>
      {tour.state.status === "off" ? null : (
        <TourCard tour={tour} welcome={WELCOME} ending={ENDING} />
      )}
    </>
  );
}

function renderTour(options: { offer?: boolean; persistent?: boolean } = {}) {
  const services = createFakeServices();
  const focusMap = vi.fn();
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <FocusRegistryProvider focusMap={focusMap}>
          <Harness offer={options.offer ?? true} />
        </FocusRegistryProvider>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, services, focusMap };
}

const polite = () => screen.getByTestId("live-region-polite").textContent;
const card = () => screen.queryByRole("region", { name: /./ });

describe("TourCard", () => {
  it("offers a welcome card named by its heading that takes no focus, and announces it once", async () => {
    renderTour();
    const welcome = screen.getByRole("region", { name: "New here?" });
    expect(welcome).toHaveTextContent("A short tour shows how.");
    expect(document.activeElement).toBe(document.body);
    await waitFor(() => expect(polite()).toBe("A short tour is available."));
  });

  it("shows nothing when the tour is not offered", () => {
    renderTour({ offer: false });
    expect(card()).toBeNull();
  });

  it("takes the tour: stores the version, focuses the step heading and rings its control", async () => {
    const { services } = renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(services.settings.get().tourSeen).toBe(2);
    const heading = screen.getByRole("heading", { name: "Turn on a layer" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Map options" })
        .getAttribute("data-tour-highlight"),
    ).toBe("true");
  });

  it("advances when the person does the step, keeping their focus and announcing the next", async () => {
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    const layer = screen.getByRole("button", { name: "Turn a layer on" });
    layer.focus();
    fireEvent.click(layer);
    expect(
      screen.getByRole("heading", { name: "Find a place" }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(layer);
    expect(
      screen
        .getByRole("button", { name: "Map options" })
        .hasAttribute("data-tour-highlight"),
    ).toBe(false);
    await waitFor(() =>
      expect(polite()).toBe(
        "Step 2 of 2, Find a place. Type a place in Search.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Focus search" }));
    expect(
      screen.getByRole("heading", { name: "Tour finished" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(polite()).toBe("Tour finished."));
  });

  it("goes through every step with Next and Finish, then closes, returning focus to the map", async () => {
    const { focusMap } = renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Find a place" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Tour finished" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(card()).toBeNull();
    expect(focusMap).toHaveBeenCalledTimes(1);
  });

  it("skips from the welcome card and stores the version, leaving focus alone when it was elsewhere", async () => {
    const { services, focusMap } = renderTour();
    act(() => {
      screen.getByRole("button", { name: "Skip" }).click();
    });
    expect(card()).toBeNull();
    expect(services.settings.get().tourSeen).toBe(2);
    expect(focusMap).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(polite()).toBe(
        "Tour skipped. Help, in Settings, can start it again.",
      ),
    );
  });

  it("skips on Escape inside the card, and prevents the default so nothing else closes", async () => {
    const { focusMap } = renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    const notPrevented = fireEvent.keyDown(document.activeElement as Element, {
      key: "Escape",
    });
    expect(notPrevented).toBe(false);
    expect(card()).toBeNull();
    expect(focusMap).toHaveBeenCalledTimes(1);
  });

  it("closes the ending card on Escape", async () => {
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(card()).toBeNull();
  });

  it("closes the welcome card, and stores the version, when the person turns a layer on unprompted", async () => {
    const { services } = renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Turn a layer on" }));
    expect(card()).toBeNull();
    expect(services.settings.get().tourSeen).toBe(2);
  });

  it("restarts at the first step and focuses it, even when it was never offered", () => {
    renderTour({ offer: false });
    act(() => latestStart());
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Turn on a layer" }),
    );
  });
});
