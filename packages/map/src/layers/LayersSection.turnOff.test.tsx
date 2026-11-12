// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LAYERS,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { LayersSection } from "./LayersSection";
import {
  type DataLayers,
  UNDO_TIMEOUT_MS,
  useDataLayers,
} from "./useDataLayers";

const announce = vi.hoisted(() => vi.fn());
vi.mock("../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const NOW = Date.UTC(2026, 10, 9, 12);
const FEED = SAMPLE_FEED_LAYER.id;
const ALERTS = SAMPLE_ALERT_LAYER.id;
const IMAGERY = SAMPLE_TILE_LAYER.id;

/** What has been said aloud, in order. */
const said = () => announce.mock.calls.map(([message]) => message);

function setup(props: { showTurnOffAll?: boolean } = {}) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(SAMPLE_LAYERS),
  });
  const handle: { current: DataLayers | null } = { current: null };
  const visible: { set: (shown: boolean) => void } = { set: () => {} };
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    const [shown, setShown] = useState(true);
    handle.current = layers;
    visible.set = setShown;
    return shown ? <LayersSection layers={layers} {...props} /> : null;
  }
  const view = render(
    <ServicesProvider services={services}>
      <Harness />
    </ServicesProvider>,
  );
  const layers = () => handle.current as DataLayers;
  return {
    ...view,
    layers,
    showSection: (shown: boolean) => act(() => visible.set(shown)),
    /** Turns layers on by id, then forgets what that said. */
    turnOn: (...ids: string[]) => {
      act(() => {
        for (const id of ids) {
          layers().setEnabled(id, true);
        }
      });
      announce.mockClear();
    },
  };
}

const turnOffAll = () => screen.getByRole("button", { name: /Turn off all/ });
const undo = () => screen.getByRole("button", { name: /^Undo/ });
const switchFor = (name: string) => screen.getByRole("switch", { name });

beforeEach(() => {
  announce.mockClear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Turn off all layers", () => {
  it("is a labelled button at the top of the section that is disabled, not hidden, when no layer is on", () => {
    setup();
    const button = turnOffAll();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveTextContent("Turn off all layers");
    expect(button).toHaveTextContent("0 on");
    const section = screen.getByTestId("sheet-section-layers");
    expect(
      section.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_CONTAINED_BY,
    ).toBeTruthy();
  });

  it("shows how many layers are on", () => {
    const view = setup();
    view.turnOn(FEED, IMAGERY);
    expect(turnOffAll()).toHaveTextContent("2 on");
    expect(turnOffAll()).not.toHaveAttribute("aria-disabled");
  });

  it("does nothing when pressed with no layer on", () => {
    setup();
    fireEvent.click(turnOffAll());
    expect(announce).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  });

  it("turns every layer off and says so below the button, which stays, now disabled", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    fireEvent.click(turnOffAll());
    expect(view.layers().layers.some((layer) => layer.enabled)).toBe(false);
    expect(switchFor("Sample points")).not.toBeChecked();
    expect(undo().parentElement).toHaveTextContent("Turned off 3 layers.");
    expect(turnOffAll()).toHaveAttribute("aria-disabled", "true");
    expect(turnOffAll()).toHaveTextContent("0 on");
  });

  it("keeps the button usable while the Undo shows, once a layer is on again", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    fireEvent.click(turnOffAll());
    fireEvent.click(switchFor("Sample points"));
    expect(turnOffAll()).not.toHaveAttribute("aria-disabled");
    expect(turnOffAll()).toHaveTextContent("1 on");
    expect(undo().parentElement).toHaveTextContent("Turned off 2 layers.");
  });

  it("stops claiming a batch once every layer of it is on again", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS);
    fireEvent.click(turnOffAll());
    fireEvent.click(switchFor("Sample points"));
    fireEvent.click(switchFor("Sample alerts"));
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(screen.queryByText(/Turned off/)).toBeNull();
  });

  it("names what Undo undoes, beginning with the visible word", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    fireEvent.click(turnOffAll());
    expect(undo()).toHaveAccessibleName("Undo turning off 3 layers");
    expect(undo()).toHaveTextContent("Undo");
  });

  it("uses the singular for one layer", () => {
    const view = setup();
    view.turnOn(IMAGERY);
    fireEvent.click(turnOffAll());
    expect((undo().parentElement as HTMLElement).textContent).toContain(
      "Turned off 1 layer.",
    );
    expect(said()).toEqual(["1 layer turned off. Undo available"]);
  });

  it("announces once, through the shared announcer, and the visible status is not a live region", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    fireEvent.click(turnOffAll());
    expect(said()).toEqual(["3 layers turned off. Undo available"]);
    const section = screen.getByTestId("sheet-section-layers");
    expect(within(section).queryByRole("status")).toBeNull();
    expect(within(section).queryByRole("alert")).toBeNull();
    expect(section.querySelector("[aria-live]")).toBeNull();
  });

  it("leaves focus on the button, with Undo the next stop after it", () => {
    const view = setup();
    view.turnOn(FEED);
    turnOffAll().focus();
    fireEvent.click(turnOffAll());
    expect(turnOffAll()).toHaveFocus();
    expect(
      turnOffAll().compareDocumentPosition(undo()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("restores the layers with the control values they have on Undo, and puts focus back on the button", () => {
    const view = setup();
    view.turnOn(FEED, IMAGERY);
    act(() => view.layers().setControl(FEED, "window", "hour"));
    turnOffAll().focus();
    fireEvent.click(turnOffAll());
    announce.mockClear();
    act(() => undo().focus());
    fireEvent.click(undo());
    expect(switchFor("Sample points")).toBeChecked();
    expect(switchFor("Sample imagery")).toBeChecked();
    expect(
      view.layers().layers.find((layer) => layer.definition.id === FEED)
        ?.controls,
    ).toMatchObject({ window: "hour" });
    expect(said()).toEqual(["2 layers turned back on"]);
    expect(turnOffAll()).toHaveFocus();
    expect(turnOffAll()).toHaveTextContent("2 on");
  });

  it("lets the status go after its time, and the button is back, disabled", () => {
    const view = setup();
    view.turnOn(FEED);
    fireEvent.click(turnOffAll());
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS - 1);
    });
    expect(undo()).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(turnOffAll()).toHaveAttribute("aria-disabled", "true");
    expect(view.layers().turnedOff).toBeNull();
  });

  it("waits while focus is on Undo, and goes after its time once focus has moved on", () => {
    const view = setup();
    view.turnOn(FEED);
    fireEvent.click(turnOffAll());
    act(() => undo().focus());
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS * 3);
    });
    expect(undo()).toHaveFocus();
    const elsewhere = switchFor("Sample imagery");
    act(() => elsewhere.focus());
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(elsewhere).toHaveFocus();
  });

  it("waits while a mouse pointer is over the status", () => {
    setup().turnOn(FEED);
    fireEvent.click(turnOffAll());
    const status = undo().parentElement as HTMLElement;
    fireEvent.pointerEnter(status, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS * 2);
    });
    expect(undo()).toBeInTheDocument();
    fireEvent.pointerLeave(status, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  });

  it("does not pull focus back to the button when focus left Undo for the page and the offer later expired", () => {
    const view = setup();
    view.turnOn(FEED);
    fireEvent.click(turnOffAll());
    act(() => undo().focus());
    // A click on blank text: Undo blurs, still mounted, and nothing takes focus.
    act(() => undo().blur());
    expect(document.body).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    expect(view.layers().turnedOff).toBeNull();
    expect(turnOffAll()).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it("is not held by a tap, which a touch screen reports as the pointer entering", () => {
    setup().turnOn(FEED);
    fireEvent.click(turnOffAll());
    const status = undo().parentElement as HTMLElement;
    fireEvent.pointerEnter(status, { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  });

  it("keeps waiting when the pointer leaves while focus is still on Undo", () => {
    setup().turnOn(FEED);
    fireEvent.click(turnOffAll());
    const status = undo().parentElement as HTMLElement;
    act(() => undo().focus());
    fireEvent.pointerEnter(status, { pointerType: "mouse" });
    fireEvent.pointerLeave(status, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS * 3);
    });
    expect(undo()).toBeInTheDocument();
  });

  it("does not hold the countdown for ever when the section closes while the pointer is on it", () => {
    const view = setup();
    view.turnOn(FEED);
    fireEvent.click(turnOffAll());
    fireEvent.pointerEnter(undo().parentElement as HTMLElement, {
      pointerType: "mouse",
    });
    view.showSection(false);
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    expect(view.layers().turnedOff).toBeNull();
  });

  it("keeps the offer when the section is closed and opened again within its time", () => {
    const view = setup();
    view.turnOn(FEED);
    fireEvent.click(turnOffAll());
    view.showSection(false);
    view.showSection(true);
    expect(undo()).toBeInTheDocument();
  });

  it("is not shown when the host hides it, and neither are the group actions", () => {
    const view = setup({ showTurnOffAll: false });
    view.turnOn(FEED, IMAGERY);
    expect(screen.queryByRole("button", { name: /Turn off/ })).toBeNull();
  });
});

describe("Turn off the layers of a group", () => {
  it("is shown while the group has layers on, with their count", () => {
    const view = setup();
    expect(
      screen.queryByRole("button", { name: /Turn off \d+ in/ }),
    ).toBeNull();
    view.turnOn(FEED, ALERTS, IMAGERY);
    expect(
      screen.getByRole("button", { name: "Turn off 2 in Samples" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn off 1 in Imagery" }),
    ).toBeInTheDocument();
  });

  it("is not shown for a group with none on", () => {
    const view = setup();
    view.turnOn(IMAGERY);
    expect(screen.queryByRole("button", { name: /in Samples/ })).toBeNull();
  });

  it("turns off only its group's layers, announces once and offers Undo in its own place", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    const group = screen.getByRole("button", { name: "Turn off 2 in Samples" });
    group.focus();
    fireEvent.click(group);
    expect(
      view
        .layers()
        .layers.filter((layer) => layer.enabled)
        .map((layer) => layer.definition.id),
    ).toEqual([IMAGERY]);
    expect(said()).toEqual(["2 layers turned off. Undo available"]);
    expect((undo().parentElement as HTMLElement).textContent).toContain(
      "Turned off 2 in Samples.",
    );
    expect(turnOffAll()).toHaveTextContent("1 on");
    expect(undo()).toHaveAccessibleName("Undo turning off 2 in Samples");
    expect(undo()).toHaveFocus();
  });

  it("does not hold the countdown for focus that a pointer click handed to Undo", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    // A mouse or touch click leaves the button without the keyboard's focus
    // ring, so the Undo that inherits focus does not match :focus-visible.
    const matches = Element.prototype.matches;
    const spy = vi
      .spyOn(Element.prototype, "matches")
      .mockImplementation(function (this: Element, selector: string) {
        return selector === ":focus-visible"
          ? false
          : matches.call(this, selector);
      });
    const group = screen.getByRole("button", { name: "Turn off 2 in Samples" });
    group.focus();
    fireEvent.click(group);
    expect(undo()).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    });
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    spy.mockRestore();
  });

  it("holds the countdown for focus that the keyboard handed to Undo", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    const group = screen.getByRole("button", { name: "Turn off 2 in Samples" });
    group.focus();
    fireEvent.click(group);
    expect(undo()).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(UNDO_TIMEOUT_MS * 2);
    });
    expect(undo()).toBeInTheDocument();
  });

  it("restores only the group's layers on Undo, and the action comes back", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    const group = screen.getByRole("button", { name: "Turn off 2 in Samples" });
    group.focus();
    fireEvent.click(group);
    fireEvent.click(undo());
    expect(switchFor("Sample points")).toBeChecked();
    expect(switchFor("Sample alerts")).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Turn off 2 in Samples" }),
    ).toHaveFocus();
  });

  it("is replaced by the next batch: the latest Undo is the only one", () => {
    const view = setup();
    view.turnOn(FEED, ALERTS, IMAGERY);
    fireEvent.click(
      screen.getByRole("button", { name: "Turn off 2 in Samples" }),
    );
    fireEvent.click(turnOffAll());
    expect(screen.getAllByRole("button", { name: /^Undo/ })).toHaveLength(1);
    expect((undo().parentElement as HTMLElement).textContent).toContain(
      "Turned off 1 layer.",
    );
  });
});
