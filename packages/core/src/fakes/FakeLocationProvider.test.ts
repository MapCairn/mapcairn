// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  type LocationProviderSubject,
  runLocationProviderContract,
} from "../contracts/locationProvider.contract";
import { LocationError, PortAbortError } from "../ports/errors";
import type { LocationFix } from "../ports/location";
import {
  DEFAULT_FAKE_FIX,
  FakeLocationProvider,
  type FakeLocationProviderOptions,
} from "./FakeLocationProvider";

function subjectFor(
  options: FakeLocationProviderOptions,
): () => LocationProviderSubject {
  return () => {
    const provider = new FakeLocationProvider(options);
    return {
      provider,
      controls: {
        willFix: (fix) => provider.setFix(fix),
        willFail: (kind) => provider.failWith(kind),
        hold: () => {
          provider.holdNext();
        },
        emitFix: (fix) => provider.emitFix(fix),
        emitError: (kind) => provider.emitError(new LocationError(kind)),
      },
    };
  };
}

runLocationProviderContract(
  "FakeLocationProvider (watch)",
  subjectFor({ supportsWatch: true }),
);
runLocationProviderContract(
  "FakeLocationProvider (no watch)",
  subjectFor({ supportsWatch: false }),
);

const NEXT: LocationFix = {
  position: { lat: 1, lng: 2 },
  accuracyMetres: 3,
  timestamp: 4,
};

describe("FakeLocationProvider", () => {
  it("supports watch by default and omits watch when it does not", () => {
    expect(new FakeLocationProvider().supportsWatch).toBe(true);
    const without = new FakeLocationProvider({ supportsWatch: false });
    expect(without.supportsWatch).toBe(false);
    expect(without.watch).toBeUndefined();
  });

  it("resolves the default fix, a configured one and a scripted one", async () => {
    expect(await new FakeLocationProvider().locate()).toBe(DEFAULT_FAKE_FIX);
    const provider = new FakeLocationProvider({ fix: NEXT });
    expect(await provider.locate()).toBe(NEXT);
    provider.setFix(DEFAULT_FAKE_FIX);
    expect(await provider.locate()).toBe(DEFAULT_FAKE_FIX);
  });

  it("fails until the failure is cleared", async () => {
    const provider = new FakeLocationProvider();
    provider.failWith("denied");
    await expect(provider.locate()).rejects.toBeInstanceOf(LocationError);
    provider.clearFailure();
    expect(await provider.locate()).toBe(DEFAULT_FAKE_FIX);
  });

  it("holds a locate until the handle resolves or rejects it", async () => {
    const provider = new FakeLocationProvider();
    const first = provider.holdNext();
    const second = provider.holdNext();
    const a = provider.locate();
    const b = provider.locate();
    first.resolve(NEXT);
    second.reject(new LocationError("timeout"));
    expect(await a).toBe(NEXT);
    await expect(b).rejects.toBeInstanceOf(LocationError);
  });

  it("rejects a held locate with PortAbortError when aborted, and still delivers a rejection when not", async () => {
    const provider = new FakeLocationProvider();
    const held = provider.holdNext();
    const controller = new AbortController();
    const pending = provider.locate({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    held.resolve(NEXT);
    const other = provider.holdNext();
    const withSignal = provider.locate({
      signal: new AbortController().signal,
    });
    other.reject(new LocationError("unavailable"));
    await expect(withSignal).rejects.toBeInstanceOf(LocationError);
  });

  it("records the options of every locate", async () => {
    const provider = new FakeLocationProvider();
    await provider.locate({ timeoutMs: 100 });
    await provider.locate();
    expect(provider.locateCalls).toEqual([{ timeoutMs: 100 }, undefined]);
  });

  it("pushes fixes and errors to every watcher and counts the live ones", () => {
    const provider = new FakeLocationProvider();
    const controller = new AbortController();
    const seen: string[] = [];
    for (const label of ["a", "b"]) {
      provider.watch?.(
        {
          onFix: () => seen.push(`${label}:fix`),
          onError: () => seen.push(`${label}:error`),
        },
        { signal: controller.signal },
      );
    }
    expect(provider.watcherCount).toBe(2);
    provider.emitFix(NEXT);
    provider.emitError(new LocationError("denied"));
    expect(seen).toEqual(["a:fix", "b:fix", "a:error", "b:error"]);
    controller.abort();
    expect(provider.watcherCount).toBe(0);
  });
});
