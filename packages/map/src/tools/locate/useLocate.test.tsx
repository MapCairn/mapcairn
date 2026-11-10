import {
  createFakeServices,
  DEFAULT_FAKE_FIX,
  LocationError,
  PortAbortError,
  type UnitSystem,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import {
  LOCATING_MESSAGE,
  type UseLocateOptions,
  useLocate,
} from "./useLocate";

function setup(
  units: UnitSystem = "metric",
  options?: UseLocateOptions,
  services = createFakeServices(),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{children}</LiveRegionProvider>
    </ServicesProvider>
  );
  const view = renderHook(
    ({ unit }: { unit: UnitSystem }) => useLocate(unit, options),
    { wrapper, initialProps: { unit: units } },
  );
  return { ...view, services };
}

const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("useLocate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing until locate is called", async () => {
    const { result, services } = setup();
    await flush();
    expect(services.fakes.location.locateCalls).toHaveLength(0);
    expect(result.current).toMatchObject({
      state: "idle",
      fix: null,
      error: null,
      message: "",
    });
  });

  it("finds a fix, shows it and announces the accuracy in metric units", async () => {
    const { result, services } = setup("metric");
    act(() => result.current.locate());
    await flush();
    expect(services.fakes.location.locateCalls).toHaveLength(1);
    expect(result.current.state).toBe("found");
    expect(result.current.fix).toEqual(DEFAULT_FAKE_FIX);
    expect(result.current.error).toBeNull();
    expect(result.current.message).toBe(
      "Location found, accuracy about 25 metres",
    );
    expect(polite()).toBe("Location found, accuracy about 25 metres");
  });

  it("announces the accuracy in imperial units when asked", async () => {
    const { result } = setup("imperial");
    act(() => result.current.locate());
    await flush();
    expect(polite()).toBe("Location found, accuracy about 82 feet");
  });

  it("uses the units current when the fix arrives", async () => {
    const { result, rerender, services } = setup("metric");
    const held = services.fakes.location.holdNext();
    act(() => result.current.locate());
    rerender({ unit: "imperial" });
    await act(async () => held.resolve(DEFAULT_FAKE_FIX));
    expect(polite()).toBe("Location found, accuracy about 82 feet");
  });

  it("is locating, with a visible message, while the fix is slow", async () => {
    const { result, services } = setup();
    const held = services.fakes.location.holdNext();
    act(() => result.current.locate());
    await flush();
    expect(result.current.state).toBe("locating");
    expect(result.current.message).toBe(LOCATING_MESSAGE);
    expect(polite()).toBe("");
    await act(async () => held.resolve(DEFAULT_FAKE_FIX));
    expect(result.current.state).toBe("found");
  });

  it("passes a signal and the timeout to the provider", async () => {
    const { result, services } = setup("metric", { timeoutMs: 5000 });
    act(() => result.current.locate());
    await flush();
    const [options] = services.fakes.location.locateCalls;
    expect(options?.timeoutMs).toBe(5000);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      "denied",
      "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
    ],
    [
      "unavailable",
      "Your location is not available right now. Check that location services are on, or search for a place instead.",
    ],
    [
      "timeout",
      "Finding your location took too long. Try again, or search for a place instead.",
    ],
  ] as const)(
    "reports %s with what to do next, assertively",
    async (kind, text) => {
      const { result, services } = setup();
      services.fakes.location.failWith(kind);
      act(() => result.current.locate());
      await flush();
      expect(result.current.state).toBe("error");
      expect(result.current.error).toBe(kind);
      expect(result.current.fix).toBeNull();
      expect(result.current.message).toBe(text);
      expect(assertive()).toBe(text);
      expect(polite()).toBe("");
    },
  );

  it("leaves an error unannounced when the app shows it in an alert itself", async () => {
    const { result, services } = setup("metric", { announceErrors: false });
    services.fakes.location.failWith("denied");
    act(() => result.current.locate());
    await flush();
    expect(result.current.state).toBe("error");
    expect(result.current.message).toMatch(/Location access is blocked/);
    expect(assertive()).toBe("");
    expect(polite()).toBe("");
  });

  it("still announces a fix when errors are left to the app", async () => {
    const { result } = setup("metric", { announceErrors: false });
    act(() => result.current.locate());
    await flush();
    expect(polite()).toBe("Location found, accuracy about 25 metres");
  });

  it("keeps an error until cancelled", async () => {
    const { result, services } = setup();
    services.fakes.location.failWith("denied");
    act(() => result.current.locate());
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.state).toBe("error");
    act(() => result.current.cancel());
    expect(result.current).toMatchObject({
      state: "idle",
      error: null,
      message: "",
    });
  });

  it("treats an unexpected error as unavailable", async () => {
    const services = createFakeServices({
      location: {
        supportsWatch: false,
        locate: () => Promise.reject(new Error("boom")),
      },
    });
    const { result } = setup("metric", undefined, services);
    act(() => result.current.locate());
    await flush();
    expect(result.current.error).toBe("unavailable");
  });

  it("recovers from an error on the next request", async () => {
    const { result, services } = setup();
    services.fakes.location.failWith("timeout");
    act(() => result.current.locate());
    await flush();
    services.fakes.location.clearFailure();
    act(() => result.current.locate());
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("locating");
    await flush();
    expect(result.current.state).toBe("found");
  });

  it("cancel aborts the request in flight and nothing is announced", async () => {
    const { result, services } = setup();
    const held = services.fakes.location.holdNext();
    act(() => result.current.locate());
    await flush();
    const signal = services.fakes.location.locateCalls[0]?.signal;
    act(() => result.current.cancel());
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toBe("idle");
    await act(async () => held.resolve(DEFAULT_FAKE_FIX));
    expect(result.current.state).toBe("idle");
    expect(result.current.fix).toBeNull();
    expect(polite()).toBe("");
  });

  it("a new request aborts the old one and only the new result counts", async () => {
    const { result, services } = setup();
    const first = services.fakes.location.holdNext();
    const second = services.fakes.location.holdNext();
    act(() => result.current.locate());
    await flush();
    act(() => result.current.locate());
    await flush();
    const [a, b] = services.fakes.location.locateCalls;
    expect(a?.signal?.aborted).toBe(true);
    expect(b?.signal?.aborted).toBe(false);
    const newer = { ...DEFAULT_FAKE_FIX, accuracyMetres: 5 };
    await act(async () => second.resolve(newer));
    await act(async () => first.reject(new LocationError("denied")));
    expect(result.current.state).toBe("found");
    expect(result.current.fix).toEqual(newer);
    expect(assertive()).toBe("");
  });

  it("ignores a PortAbortError that is not from its own signal", async () => {
    const services = createFakeServices({
      location: {
        supportsWatch: false,
        locate: () => Promise.reject(new PortAbortError()),
      },
    });
    const { result } = setup("metric", undefined, services);
    act(() => result.current.locate());
    await flush();
    expect(result.current.state).toBe("locating");
    expect(assertive()).toBe("");
  });

  it("drops a fix that arrives after cancel from a provider that ignores its signal", async () => {
    let deliver: (fix: typeof DEFAULT_FAKE_FIX) => void = () => undefined;
    const services = createFakeServices({
      location: {
        supportsWatch: false,
        locate: () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      },
    });
    const { result } = setup("metric", undefined, services);
    act(() => result.current.locate());
    act(() => result.current.cancel());
    await act(async () => deliver(DEFAULT_FAKE_FIX));
    expect(result.current.state).toBe("idle");
    expect(polite()).toBe("");
  });

  it("aborts the request on unmount", async () => {
    const { result, services, unmount } = setup();
    services.fakes.location.holdNext();
    act(() => result.current.locate());
    await flush();
    const signal = services.fakes.location.locateCalls[0]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
