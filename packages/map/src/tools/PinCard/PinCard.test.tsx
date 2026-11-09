import {
  createFakeServices,
  formatLatLng,
  type SearchResult,
} from "@karta/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { PinCard, type PinCardProps } from "./PinCard";

const POSITION = { lat: -26.2041, lng: 28.0473 };
const ADDRESS: SearchResult = {
  id: "a",
  label: "1 Main Street",
  secondaryLabel: "Johannesburg",
  centre: POSITION,
};

function tree(
  services: ReturnType<typeof createFakeServices>,
  props: Partial<PinCardProps> = {},
) {
  return (
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <PinCard
          position={POSITION}
          onClear={props.onClear ?? vi.fn()}
          {...props}
        />
      </LiveRegionProvider>
    </ServicesProvider>
  );
}

function setup(props: Partial<PinCardProps> = {}) {
  const services = createFakeServices();
  const view = render(tree(services, props));
  return {
    ...view,
    services,
    rerenderWith: (next: Partial<PinCardProps>) =>
      view.rerender(tree(services, { ...props, ...next })),
  };
}

const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("PinCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("content", () => {
    it("shows a Dropped pin heading, at level 2 by default", () => {
      setup();
      expect(
        screen.getByRole("heading", { name: "Dropped pin", level: 2 }),
      ).toBeTruthy();
    });

    it.each([3, 4] as const)("uses heading level %i when asked", (level) => {
      setup({ headingLevel: level });
      expect(
        screen.getByRole("heading", { name: "Dropped pin", level }),
      ).toBeTruthy();
    });

    it("hands the heading to the host, focusable by script only", () => {
      const headingRef = createRef<HTMLHeadingElement>();
      setup({ headingRef });
      const heading = screen.getByRole("heading", { name: "Dropped pin" });
      expect(headingRef.current).toBe(heading);
      expect(heading.getAttribute("tabindex")).toBe("-1");
      act(() => heading.focus());
      expect(document.activeElement).toBe(heading);
    });

    it("shows the coordinates as plain, selectable text", () => {
      setup();
      const coordinates = screen.getByTestId("pin-coordinates");
      expect(coordinates.textContent).toBe(formatLatLng(POSITION));
      expect(coordinates.textContent).toBe("-26.20410, 28.04730");
      expect(coordinates.tagName).toBe("P");
    });

    it("has no inline styles", () => {
      const { container } = setup();
      expect(container.querySelectorAll("[style]")).toHaveLength(0);
    });

    it("calls onClear from Clear pin", () => {
      const onClear = vi.fn();
      setup({ onClear });
      fireEvent.click(screen.getByRole("button", { name: "Clear pin" }));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it("shows a close button only when onClose is given", () => {
      const { rerenderWith } = setup();
      expect(screen.queryByRole("button", { name: "Close pin" })).toBeNull();
      const onClose = vi.fn();
      rerenderWith({ onClose });
      fireEvent.click(screen.getByRole("button", { name: "Close pin" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("copying", () => {
    it("copies the formatted coordinates and says so inline and aloud", async () => {
      const { services } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Copy coordinates" }));
      await flush();
      expect(services.fakes.clipboard.written).toEqual(["-26.20410, 28.04730"]);
      const feedback = screen.getByTestId("pin-copy-feedback");
      expect(feedback.textContent).toBe("Copied");
      expect(feedback.querySelector("svg")).not.toBeNull();
      expect(polite()).toBe("Coordinates copied");
    });

    it("says it could not copy, inline and aloud, when the clipboard refuses", async () => {
      const { services } = setup();
      services.fakes.clipboard.failWith("denied");
      fireEvent.click(screen.getByRole("button", { name: "Copy coordinates" }));
      await flush();
      const feedback = screen.getByTestId("pin-copy-feedback");
      expect(feedback.textContent).toBe("Could not copy");
      expect(feedback.querySelector("svg")).not.toBeNull();
      expect(assertive()).toBe(
        "Could not copy. Select the coordinates and copy them manually.",
      );
    });

    it("shows no feedback before anything is copied", () => {
      setup();
      expect(screen.queryByTestId("pin-copy-feedback")).toBeNull();
    });

    it("replaces failed feedback with Copied after a later success", async () => {
      const { services } = setup();
      services.fakes.clipboard.failWith("failed");
      const button = screen.getByRole("button", { name: "Copy coordinates" });
      fireEvent.click(button);
      await flush();
      services.fakes.clipboard.succeed();
      fireEvent.click(button);
      await flush();
      expect(screen.getByTestId("pin-copy-feedback").textContent).toBe(
        "Copied",
      );
    });

    it("forgets the feedback when the pin moves", async () => {
      const { rerenderWith } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Copy coordinates" }));
      await flush();
      expect(screen.getByTestId("pin-copy-feedback")).toBeTruthy();
      rerenderWith({ position: { lat: -33.9, lng: 18.4 } });
      expect(screen.queryByTestId("pin-copy-feedback")).toBeNull();
    });

    it("ignores a copy that finishes after the pin moved", async () => {
      const services = createFakeServices();
      let finish: (value: { ok: true }) => void = () => undefined;
      services.clipboard.writeText = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      const { rerender } = render(tree(services));
      fireEvent.click(screen.getByRole("button", { name: "Copy coordinates" }));
      rerender(tree(services, { position: { lat: -33.9, lng: 18.4 } }));
      await act(async () => finish({ ok: true }));
      expect(screen.queryByTestId("pin-copy-feedback")).toBeNull();
      expect(polite()).toBe("");
    });

    it("ignores a copy that finishes after the card closed", async () => {
      const services = createFakeServices();
      let finish: (value: { ok: true }) => void = () => undefined;
      services.clipboard.writeText = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      const card = (show: boolean) => (
        <ServicesProvider services={services}>
          <LiveRegionProvider>
            {show ? <PinCard position={POSITION} onClear={vi.fn()} /> : null}
          </LiveRegionProvider>
        </ServicesProvider>
      );
      const { rerender } = render(card(true));
      fireEvent.click(screen.getByRole("button", { name: "Copy coordinates" }));
      rerender(card(false));
      await act(async () => finish({ ok: true }));
      expect(polite()).toBe("");
    });
  });

  describe("address", () => {
    it("shows nothing while the lookup is loading", () => {
      const { services } = setup();
      expect(services.fakes.search.reverseCalls).toHaveLength(1);
      expect(screen.queryByTestId("pin-address")).toBeNull();
    });

    it("asks the provider for the pin's position, with a signal", async () => {
      const { services } = setup();
      await flush();
      const [call] = services.fakes.search.reverseCalls;
      expect(call?.position).toEqual(POSITION);
      expect(call?.options?.signal).toBeInstanceOf(AbortSignal);
    });

    it("shows the label and secondary label when found", async () => {
      const services = createFakeServices();
      services.fakes.search.setReverseResult(ADDRESS);
      render(tree(services));
      await flush();
      expect(screen.getByTestId("pin-address").textContent).toBe(
        "1 Main Street, Johannesburg",
      );
    });

    it("shows just the label when there is no secondary label", async () => {
      const services = createFakeServices();
      services.fakes.search.setReverseResult({
        ...ADDRESS,
        secondaryLabel: undefined,
      });
      render(tree(services));
      await flush();
      expect(screen.getByTestId("pin-address").textContent).toBe(
        "1 Main Street",
      );
    });

    it("says No address found here. when there is none", async () => {
      setup();
      await flush();
      expect(screen.getByTestId("pin-address").textContent).toBe(
        "No address found here.",
      );
    });

    it("shows nothing when the lookup fails", async () => {
      const services = createFakeServices();
      services.fakes.search.failWith("offline");
      render(tree(services));
      await flush();
      expect(screen.queryByTestId("pin-address")).toBeNull();
      expect(screen.queryByText("No address found here.")).toBeNull();
    });

    it("aborts the lookup when the pin moves and shows only the new answer", async () => {
      const services = createFakeServices();
      const first = services.fakes.search.holdNext();
      const second = services.fakes.search.holdNext();
      const { rerender } = render(tree(services));
      await flush();
      rerender(tree(services, { position: { lat: -33.9, lng: 18.4 } }));
      await flush();
      const [firstCall, secondCall] = services.fakes.search.reverseCalls;
      expect(firstCall?.options?.signal?.aborted).toBe(true);
      expect(secondCall?.options?.signal?.aborted).toBe(false);
      expect(secondCall?.position).toEqual({ lat: -33.9, lng: 18.4 });
      await act(async () => second.resolve([{ ...ADDRESS, label: "New" }]));
      await act(async () => first.resolve([{ ...ADDRESS, label: "Old" }]));
      expect(screen.getByTestId("pin-address").textContent).toBe(
        "New, Johannesburg",
      );
    });

    it("clears the old address while a new lookup loads", async () => {
      const services = createFakeServices();
      services.fakes.search.setReverseResult(ADDRESS);
      const { rerender } = render(tree(services));
      await flush();
      expect(screen.getByTestId("pin-address")).toBeTruthy();
      services.fakes.search.holdNext();
      rerender(tree(services, { position: { lat: -33.9, lng: 18.4 } }));
      expect(screen.queryByTestId("pin-address")).toBeNull();
    });

    it("aborts the lookup on unmount", async () => {
      const services = createFakeServices();
      services.fakes.search.holdNext();
      const view = render(tree(services));
      await flush();
      const signal = services.fakes.search.reverseCalls[0]?.options?.signal;
      view.unmount();
      expect(signal?.aborted).toBe(true);
    });
  });
});
