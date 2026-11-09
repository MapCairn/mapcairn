import { describe, expect, it } from "vitest";
import {
  LocationError,
  type LocationErrorKind,
  PortAbortError,
} from "../ports/errors";
import type { LocationFix, LocationProvider } from "../ports/location";

/**
 * How the location contract scripts a provider. A real adapter implements
 * these by mocking `navigator.geolocation`.
 */
export interface LocationProviderControls {
  /** Makes every later `locate` resolve with this fix. */
  willFix(fix: LocationFix): void;
  /** Makes every later `locate` fail the way `kind` describes. */
  willFail(kind: LocationErrorKind): void;
  /** Keeps the next `locate` pending until its signal aborts. */
  hold(): void;
  /** Delivers a fix to the active watch. Used only when `supportsWatch`. */
  emitFix(fix: LocationFix): void;
  /** Delivers an error of this kind to the active watch. Used only when `supportsWatch`. */
  emitError(kind: LocationErrorKind): void;
}

/** One location provider under test, with its controls. */
export interface LocationProviderSubject {
  readonly provider: LocationProvider;
  readonly controls: LocationProviderControls;
}

const FIX: LocationFix = {
  position: { lat: -26.2041, lng: 28.0473 },
  accuracyMetres: 12,
  timestamp: 1_700_000_000_000,
};

const NEXT_FIX: LocationFix = {
  position: { lat: -26.2051, lng: 28.0483 },
  accuracyMetres: 8,
  timestamp: 1_700_000_005_000,
};

const ERROR_KINDS: readonly LocationErrorKind[] = [
  "denied",
  "unavailable",
  "timeout",
];

/**
 * Runs the shared behavioural suite for a {@link LocationProvider}. Every
 * test calls `create` for a fresh subject. The watch tests run only when the
 * provider reports `supportsWatch`, so run the suite once for each case.
 */
export function runLocationProviderContract(
  name: string,
  create: () => LocationProviderSubject,
): void {
  describe(`LocationProvider contract: ${name}`, () => {
    it("reports supportsWatch consistently with the presence of watch", () => {
      const { provider } = create();
      expect(typeof provider.supportsWatch).toBe("boolean");
      expect(typeof provider.watch === "function").toBe(provider.supportsWatch);
    });

    it("resolves a fix with a position, an accuracy and a timestamp", async () => {
      const { provider, controls } = create();
      controls.willFix(FIX);
      const fix = await provider.locate();
      expect(fix.position.lat).toBeCloseTo(FIX.position.lat, 4);
      expect(fix.position.lng).toBeCloseTo(FIX.position.lng, 4);
      expect(typeof fix.accuracyMetres).toBe("number");
      expect(typeof fix.timestamp).toBe("number");
    });

    it("accepts a timeout option", async () => {
      const { provider, controls } = create();
      controls.willFix(FIX);
      const fix = await provider.locate({ timeoutMs: 5000 });
      expect(typeof fix.accuracyMetres).toBe("number");
    });

    for (const kind of ERROR_KINDS) {
      it(`rejects a ${kind} failure with a LocationError of that kind`, async () => {
        const { provider, controls } = create();
        controls.willFail(kind);
        const error = await provider.locate().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(LocationError);
        expect((error as LocationError).kind).toBe(kind);
      });
    }

    it("rejects with PortAbortError when the signal is already aborted", async () => {
      const { provider, controls } = create();
      controls.willFix(FIX);
      const controller = new AbortController();
      controller.abort();
      await expect(
        provider.locate({ signal: controller.signal }),
      ).rejects.toBeInstanceOf(PortAbortError);
    });

    it("rejects with PortAbortError when the signal fires mid-request", async () => {
      const { provider, controls } = create();
      controls.hold();
      const controller = new AbortController();
      const pending = provider.locate({ signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    });

    it("delivers watch fixes and typed errors until the signal aborts", () => {
      const { provider, controls } = create();
      if (provider.watch === undefined) {
        return;
      }
      const fixes: LocationFix[] = [];
      const errors: Error[] = [];
      const controller = new AbortController();
      provider.watch(
        { onFix: (fix) => fixes.push(fix), onError: (e) => errors.push(e) },
        { signal: controller.signal },
      );
      controls.emitFix(FIX);
      controls.emitError("unavailable");
      expect(fixes).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(LocationError);
      expect((errors[0] as LocationError).kind).toBe("unavailable");
      controller.abort();
      controls.emitFix(NEXT_FIX);
      controls.emitError("timeout");
      expect(fixes).toHaveLength(1);
      expect(errors).toHaveLength(1);
    });

    it("does not start a watch with a signal that is already aborted", () => {
      const { provider, controls } = create();
      if (provider.watch === undefined) {
        return;
      }
      const fixes: LocationFix[] = [];
      const controller = new AbortController();
      controller.abort();
      provider.watch(
        { onFix: (fix) => fixes.push(fix), onError: () => undefined },
        { signal: controller.signal },
      );
      controls.emitFix(FIX);
      expect(fixes).toHaveLength(0);
    });
  });
}
