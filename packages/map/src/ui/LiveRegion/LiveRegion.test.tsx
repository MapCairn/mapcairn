// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeMessageCatalogue,
  message,
} from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import {
  type Announce,
  LiveRegionProvider,
  LiveRegionScope,
  useAnnounce,
} from "./LiveRegion";

let announce: Announce = () => undefined;

function Capture() {
  announce = useAnnounce();
  return null;
}

function renderProvider() {
  return render(
    <LiveRegionProvider>
      <Capture />
    </LiveRegionProvider>,
  );
}

const polite = () => screen.getByRole("status");
const assertive = () => screen.getByRole("alert");

describe("useAnnounce outside a provider", () => {
  it("does nothing and warns once in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    function Orphan() {
      announce = useAnnounce();
      return null;
    }
    const { unmount } = render(<Orphan />);
    expect(() => announce("Hello")).not.toThrow();
    unmount();
    render(<Orphan />);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("LiveRegionProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts one polite status region and one assertive alert region", () => {
    renderProvider();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(polite().getAttribute("aria-live")).toBe("polite");
    expect(assertive().getAttribute("aria-live")).toBe("assertive");
    expect(polite().textContent).toBe("");
    expect(assertive().textContent).toBe("");
  });

  it("renders its children", () => {
    render(
      <LiveRegionProvider>
        <p>Child</p>
      </LiveRegionProvider>,
    );
    expect(screen.getByText("Child")).toBeTruthy();
  });

  it("announces politely by default", () => {
    renderProvider();
    act(() => announce("Route found"));
    expect(polite().textContent).toBe("Route found");
    expect(assertive().textContent).toBe("");
  });

  it("announces assertively on request", () => {
    renderProvider();
    act(() => announce("Location denied", { priority: "assertive" }));
    expect(assertive().textContent).toBe("Location denied");
    expect(polite().textContent).toBe("");
  });

  it("ignores an empty message", () => {
    renderProvider();
    act(() => announce("   "));
    expect(polite().textContent).toBe("");
  });

  it("coalesces messages arriving within 600 ms to the latest", () => {
    renderProvider();
    act(() => announce("First"));
    expect(polite().textContent).toBe("First");
    act(() => {
      vi.advanceTimersByTime(100);
      announce("Second");
      vi.advanceTimersByTime(100);
      announce("Third");
    });
    expect(polite().textContent).toBe("First");
    act(() => vi.advanceTimersByTime(399));
    expect(polite().textContent).toBe("First");
    act(() => vi.advanceTimersByTime(1));
    expect(polite().textContent).toBe("Third");
  });

  it("throttles each priority on its own", () => {
    renderProvider();
    act(() => announce("Polite one"));
    act(() => announce("Urgent", { priority: "assertive" }));
    expect(polite().textContent).toBe("Polite one");
    expect(assertive().textContent).toBe("Urgent");
  });

  it("drops an identical message within 2 seconds", () => {
    renderProvider();
    act(() => announce("Saved"));
    act(() => vi.advanceTimersByTime(700));
    act(() => announce("Saved"));
    // Nothing was queued, so no clear-then-set happens.
    expect(polite().textContent).toBe("Saved");
    act(() => vi.advanceTimersByTime(1000));
    expect(polite().textContent).toBe("Saved");
  });

  it("accepts a different message inside the de-duplication window", () => {
    renderProvider();
    act(() => announce("Saved"));
    act(() => vi.advanceTimersByTime(700));
    act(() => announce("Deleted"));
    expect(polite().textContent).toBe("Deleted");
  });

  it("clears then sets so a message repeated later is announced again", () => {
    renderProvider();
    act(() => announce("Saved"));
    act(() => vi.advanceTimersByTime(2100));
    act(() => announce("Saved"));
    expect(polite().textContent).toBe("");
    act(() => vi.advanceTimersByTime(50));
    expect(polite().textContent).toBe("Saved");
  });

  it("returns the same function across renders", () => {
    const seen: Announce[] = [];
    function Probe() {
      seen.push(useAnnounce());
      return null;
    }
    const { rerender } = render(
      <LiveRegionProvider>
        <Probe />
      </LiveRegionProvider>,
    );
    rerender(
      <LiveRegionProvider>
        <Probe />
      </LiveRegionProvider>,
    );
    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(1);
  });

  it("warns in development when a second provider is mounted", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <>
        <LiveRegionProvider />
        <LiveRegionProvider />
      </>,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("more than once"),
    );
    warn.mockRestore();
  });

  it("does not warn for a single provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    renderProvider();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stops pending timers when it unmounts", () => {
    const { unmount } = renderProvider();
    act(() => announce("First"));
    act(() => announce("Queued"));
    unmount();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops the clear-then-set timer when it unmounts", () => {
    const { unmount } = renderProvider();
    act(() => announce("Saved"));
    act(() => vi.advanceTimersByTime(2100));
    act(() => announce("Saved"));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("announcing a message", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderWithServices(services = createFakeServices()) {
    render(
      <ServicesProvider services={services}>
        <LiveRegionProvider>
          <Capture />
        </LiveRegionProvider>
      </ServicesProvider>,
    );
    return services;
  }

  it("formats a message with the active catalogue just before setting the text", () => {
    const services = renderWithServices();
    act(() => announce(message("announce.layerOn", { name: "Rain" })));
    expect(polite().textContent).toBe("Rain is on.");
    expect(services.fakes.messages.calls).toEqual([
      { key: "announce.layerOn", params: { name: "Rain" } },
    ]);
  });

  it("speaks in the language of the catalogue it is given", () => {
    renderWithServices(
      createFakeServices({
        messages: new FakeMessageCatalogue({
          language: "af",
          overrides: { "announce.layerOn": "{name} is aan." },
        }),
      }),
    );
    act(() => announce(message("announce.layerOn", { name: "Reën" })));
    expect(polite().textContent).toBe("Reën is aan.");
  });

  it("falls back to English outside a services provider", () => {
    renderProvider();
    act(() => announce(message("announce.layerOn", { name: "Rain" })));
    expect(polite().textContent).toBe("Rain is on.");
  });

  it("drops the same outcome twice in a row whether it is text or a message", () => {
    renderWithServices();
    act(() => announce(message("announce.layerOn", { name: "Rain" })));
    act(() => vi.advanceTimersByTime(700));
    act(() => announce("Rain is on."));
    act(() => vi.advanceTimersByTime(1000));
    expect(polite().textContent).toBe("Rain is on.");
  });

  it("keeps a message that reports an outcome, as keep does for text", () => {
    renderWithServices();
    act(() => announce("First"));
    act(() => announce(message("announce.imageSaved", {}), { keep: true }));
    act(() => announce("Latest"));
    act(() => vi.advanceTimersByTime(600));
    expect(polite().textContent).toBe("Map image saved.");
    act(() => vi.advanceTimersByTime(600));
    expect(polite().textContent).toBe("Latest");
  });
});

describe("LiveRegionScope", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats announcements below it and passes others through", () => {
    render(
      <LiveRegionProvider>
        <LiveRegionScope format={(text) => `Scoped: ${text}`}>
          <Capture />
        </LiveRegionScope>
      </LiveRegionProvider>,
    );
    act(() => announce("Hello"));
    expect(polite().textContent).toBe("Scoped: Hello");
  });

  it("leaves the announcer unchanged without a format", () => {
    render(
      <LiveRegionProvider>
        <LiveRegionScope>
          <Capture />
        </LiveRegionScope>
      </LiveRegionProvider>,
    );
    act(() => announce("Hello"));
    expect(polite().textContent).toBe("Hello");
  });

  it("does nothing outside a provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <LiveRegionScope format={(text) => text}>
        <Capture />
      </LiveRegionScope>,
    );
    expect(() => announce("Hello")).not.toThrow();
    warn.mockRestore();
  });
});
