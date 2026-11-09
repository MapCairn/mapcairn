import { describe, expect, it } from "vitest";
import type {
  DevicePreferences,
  DevicePreferencesValue,
} from "../ports/preferences";

/**
 * How the contract scripts the preferences. A real adapter implements this by
 * mocking `matchMedia`.
 */
export interface DevicePreferencesControls {
  /** Changes a preference, as the user or the device would. */
  set(patch: Partial<DevicePreferencesValue>): void;
}

/** One preferences implementation under test, with its controls. */
export interface DevicePreferencesSubject {
  readonly preferences: DevicePreferences;
  readonly controls: DevicePreferencesControls;
}

/**
 * Runs the shared behavioural suite for {@link DevicePreferences}. Every test
 * calls `create` for a fresh subject.
 */
export function runDevicePreferencesContract(
  name: string,
  create: () => DevicePreferencesSubject,
): void {
  describe(`DevicePreferences contract: ${name}`, () => {
    it("reports both preferences as booleans", () => {
      const { preferences } = create();
      const value = preferences.get();
      expect(typeof value.reducedMotion).toBe("boolean");
      expect(typeof value.finePointer).toBe("boolean");
    });

    it("returns the same object until a preference changes", () => {
      const { preferences, controls } = create();
      controls.set({ reducedMotion: false });
      const first = preferences.get();
      expect(preferences.get()).toBe(first);
      controls.set({ reducedMotion: false });
      expect(preferences.get()).toBe(first);
    });

    it("reflects a changed preference", () => {
      const { preferences, controls } = create();
      controls.set({ reducedMotion: true, finePointer: false });
      expect(preferences.get()).toEqual({
        reducedMotion: true,
        finePointer: false,
      });
    });

    it("notifies subscribers with the new value, only on real changes", () => {
      const { preferences, controls } = create();
      controls.set({ reducedMotion: false });
      const seen: DevicePreferencesValue[] = [];
      preferences.subscribe((value) => seen.push(value));
      controls.set({ reducedMotion: false });
      expect(seen).toHaveLength(0);
      controls.set({ reducedMotion: true });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.reducedMotion).toBe(true);
    });

    it("stops notifying after unsubscribe, and unsubscribing twice is safe", () => {
      const { preferences, controls } = create();
      controls.set({ reducedMotion: false });
      let calls = 0;
      const unsubscribe = preferences.subscribe(() => {
        calls += 1;
      });
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
      controls.set({ reducedMotion: true });
      expect(calls).toBe(0);
    });
  });
}
