import {
  LocationError,
  type LocationErrorKind,
  type LocationFix,
  PortAbortError,
} from "@karta/core";
import { runLocationProviderContract } from "@karta/core/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  BrowserLocationProvider,
  type GeolocationLike,
} from "./BrowserLocationProvider";

const CODES: Record<LocationErrorKind, number> = {
  denied: 1,
  unavailable: 2,
  timeout: 3,
};

type PositionCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

function position(fix: LocationFix): GeolocationPosition {
  return {
    coords: {
      latitude: fix.position.lat,
      longitude: fix.position.lng,
      accuracy: fix.accuracyMetres,
    },
    timestamp: fix.timestamp,
  } as unknown as GeolocationPosition;
}

function positionError(code: number): GeolocationPositionError {
  return { code, message: "scripted" } as GeolocationPositionError;
}

type Mode =
  | { kind: "fix"; fix: LocationFix }
  | { kind: "fail"; failure: LocationErrorKind }
  | { kind: "hold" };

/** A scripted `navigator.geolocation`. */
function fakeGeolocation() {
  let mode: Mode = { kind: "hold" };
  const watches = new Map<
    number,
    { onFix: PositionCallback; onError: ErrorCallback }
  >();
  let nextId = 1;
  const getCurrentPosition = vi.fn(
    (
      success: PositionCallback,
      failure?: ErrorCallback | null,
      _options?: PositionOptions,
    ) => {
      if (mode.kind === "fix") {
        success(position(mode.fix));
      } else if (mode.kind === "fail") {
        failure?.(positionError(CODES[mode.failure]));
      }
    },
  );
  const watchPosition = vi.fn(
    (
      onFix: PositionCallback,
      onError?: ErrorCallback | null,
      _options?: PositionOptions,
    ) => {
      const id = nextId++;
      watches.set(id, { onFix, onError: onError ?? (() => undefined) });
      return id;
    },
  );
  const clearWatch = vi.fn((id: number) => {
    watches.delete(id);
  });
  const geolocation = {
    getCurrentPosition,
    watchPosition,
    clearWatch,
  } as unknown as GeolocationLike;
  return {
    geolocation,
    getCurrentPosition,
    watchPosition,
    clearWatch,
    watches,
    setMode(next: Mode) {
      mode = next;
    },
  };
}

function subject(options: { geolocation: boolean }) {
  const fake = fakeGeolocation();
  const provider = new BrowserLocationProvider({
    getGeolocation: () => (options.geolocation ? fake.geolocation : undefined),
  });
  return {
    fake,
    provider,
    controls: {
      willFix: (fix: LocationFix) => fake.setMode({ kind: "fix", fix }),
      willFail: (failure: LocationErrorKind) =>
        fake.setMode({ kind: "fail", failure }),
      hold: () => fake.setMode({ kind: "hold" }),
      emitFix(fix: LocationFix) {
        for (const watch of [...fake.watches.values()]) {
          watch.onFix(position(fix));
        }
      },
      emitError(kind: LocationErrorKind) {
        for (const watch of [...fake.watches.values()]) {
          watch.onError(positionError(CODES[kind]));
        }
      },
    },
  };
}

const FIX: LocationFix = {
  position: { lat: -26.2, lng: 28.04 },
  accuracyMetres: 15,
  timestamp: 1_700_000_000_000,
};

runLocationProviderContract("BrowserLocationProvider", () => {
  const { provider, controls } = subject({ geolocation: true });
  return { provider, controls };
});

describe("BrowserLocationProvider", () => {
  it("does not touch geolocation until locate or watch is called", () => {
    const { fake, provider } = subject({ geolocation: true });
    expect(provider.supportsWatch).toBe(true);
    expect(fake.getCurrentPosition).not.toHaveBeenCalled();
    expect(fake.watchPosition).not.toHaveBeenCalled();
  });

  it("maps the fix to a position, accuracy and timestamp", async () => {
    const { fake, provider } = subject({ geolocation: true });
    fake.setMode({ kind: "fix", fix: FIX });
    expect(await provider.locate()).toEqual(FIX);
  });

  it("asks for a quick, coarse fix with the default or given timeout", async () => {
    const { fake, provider } = subject({ geolocation: true });
    fake.setMode({ kind: "fix", fix: FIX });
    await provider.locate();
    await provider.locate({ timeoutMs: 2500 });
    expect(fake.getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      timeout: 20_000,
      maximumAge: 30_000,
    });
    expect(fake.getCurrentPosition.mock.calls[1]?.[2]).toMatchObject({
      timeout: 2500,
    });
  });

  it("uses the constructor's timeout and accuracy options", async () => {
    const fake = fakeGeolocation();
    fake.setMode({ kind: "fix", fix: FIX });
    const provider = new BrowserLocationProvider({
      getGeolocation: () => fake.geolocation,
      defaultTimeoutMs: 3000,
      enableHighAccuracy: false,
    });
    await provider.locate();
    expect(fake.getCurrentPosition.mock.calls[0]?.[2]).toMatchObject({
      timeout: 3000,
      enableHighAccuracy: false,
    });
  });

  it("rejects with unavailable, and offers no watch, when the browser has no geolocation", async () => {
    const { provider } = subject({ geolocation: false });
    expect(provider.supportsWatch).toBe(false);
    expect(provider.watch).toBeUndefined();
    const error = await provider.locate().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocationError);
    expect((error as LocationError).kind).toBe("unavailable");
  });

  it("rejects with unavailable for an error code it does not know", async () => {
    const fake = fakeGeolocation();
    fake.getCurrentPosition.mockImplementation((_success, failure) => {
      failure?.(positionError(99));
    });
    const provider = new BrowserLocationProvider({
      getGeolocation: () => fake.geolocation,
    });
    const error = await provider.locate().catch((e: unknown) => e);
    expect((error as LocationError).kind).toBe("unavailable");
  });

  it("rejects with unavailable for an error without a code", async () => {
    const fake = fakeGeolocation();
    fake.getCurrentPosition.mockImplementation((_success, failure) => {
      failure?.(undefined as unknown as GeolocationPositionError);
    });
    const provider = new BrowserLocationProvider({
      getGeolocation: () => fake.geolocation,
    });
    const error = await provider.locate().catch((e: unknown) => e);
    expect((error as LocationError).kind).toBe("unavailable");
  });

  it("maps a synchronous SecurityError to denied and other throws to unavailable", async () => {
    for (const [thrown, kind] of [
      [new DOMException("insecure", "SecurityError"), "denied"],
      [new Error("boom"), "unavailable"],
      ["not an error", "unavailable"],
    ] as const) {
      const fake = fakeGeolocation();
      fake.getCurrentPosition.mockImplementation(() => {
        throw thrown;
      });
      const provider = new BrowserLocationProvider({
        getGeolocation: () => fake.geolocation,
      });
      const error = await provider.locate().catch((e: unknown) => e);
      expect((error as LocationError).kind).toBe(kind);
    }
  });

  it("ignores an answer that arrives after an abort, and after settling", async () => {
    const fake = fakeGeolocation();
    let answer: PositionCallback | undefined;
    fake.getCurrentPosition.mockImplementation((success) => {
      answer = success;
    });
    const provider = new BrowserLocationProvider({
      getGeolocation: () => fake.geolocation,
    });
    const controller = new AbortController();
    const pending = provider.locate({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    expect(() => answer?.(position(FIX))).not.toThrow();
  });

  it("stops listening to the signal once the request is answered", async () => {
    const { fake, provider } = subject({ geolocation: true });
    fake.setMode({ kind: "fix", fix: FIX });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await provider.locate({ signal: controller.signal });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  describe("watch", () => {
    it("clears the browser watch when the signal aborts", () => {
      const { fake, provider } = subject({ geolocation: true });
      const controller = new AbortController();
      provider.watch?.(
        { onFix: () => undefined, onError: () => undefined },
        { signal: controller.signal },
      );
      expect(fake.watches.size).toBe(1);
      controller.abort();
      expect(fake.clearWatch).toHaveBeenCalledOnce();
      expect(fake.watches.size).toBe(0);
    });

    it("ignores callbacks that arrive after the watch stopped", () => {
      const { fake, provider } = subject({ geolocation: true });
      const onFix = vi.fn();
      const onError = vi.fn();
      const controller = new AbortController();
      provider.watch?.({ onFix, onError }, { signal: controller.signal });
      const callbacks = [...fake.watches.values()][0];
      controller.abort();
      callbacks?.onFix(position(FIX));
      callbacks?.onError(positionError(1));
      expect(onFix).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it("asks for no timeout", () => {
      const { fake, provider } = subject({ geolocation: true });
      provider.watch?.(
        { onFix: () => undefined, onError: () => undefined },
        { signal: new AbortController().signal },
      );
      expect(fake.watchPosition.mock.calls[0]?.[2]).toEqual({
        enableHighAccuracy: false,
        maximumAge: 0,
      });
    });

    it("reports a synchronous failure to start as a typed error", () => {
      const fake = fakeGeolocation();
      fake.watchPosition.mockImplementation(() => {
        throw new DOMException("insecure", "SecurityError");
      });
      const provider = new BrowserLocationProvider({
        getGeolocation: () => fake.geolocation,
      });
      const errors: Error[] = [];
      provider.watch?.(
        { onFix: () => undefined, onError: (e) => errors.push(e) },
        { signal: new AbortController().signal },
      );
      expect((errors[0] as LocationError).kind).toBe("denied");
    });
  });

  it("uses navigator.geolocation by default", async () => {
    const fake = fakeGeolocation();
    fake.setMode({ kind: "fix", fix: FIX });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: fake.geolocation,
    });
    try {
      const provider = new BrowserLocationProvider();
      expect(provider.supportsWatch).toBe(true);
      expect((await provider.locate()).accuracyMetres).toBe(15);
    } finally {
      Reflect.deleteProperty(navigator, "geolocation");
    }
  });
});
