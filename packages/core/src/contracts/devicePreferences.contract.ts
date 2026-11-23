// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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
  /** The device preferences under test. */
  readonly preferences: DevicePreferences;
  /** How the contract scripts them. */
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
    it("reports every preference as a boolean", () => {
      const { preferences } = create();
      const value = preferences.get();
      expect(typeof value.reducedMotion).toBe("boolean");
      expect(typeof value.finePointer).toBe("boolean");
      expect(typeof value.saveData).toBe("boolean");
    });

    it("reports whether the device is online, as a boolean or not at all", () => {
      const { preferences } = create();
      const { online } = preferences.get();
      expect(online === undefined || typeof online === "boolean").toBe(true);
    });

    it("notifies subscribers once when the device goes offline and once when it returns", () => {
      const { preferences, controls } = create();
      controls.set({ online: true });
      const seen: boolean[] = [];
      preferences.subscribe((value) => seen.push(value.online !== false));
      controls.set({ online: false });
      expect(preferences.get().online).toBe(false);
      controls.set({ online: false });
      controls.set({ online: true });
      expect(preferences.get().online).toBe(true);
      expect(seen).toEqual([false, true]);
    });

    it("reports the languages as a list of tags, empty when there are none", () => {
      const { preferences } = create();
      const { languages } = preferences.get();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.every((tag) => typeof tag === "string")).toBe(true);
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
      controls.set({
        reducedMotion: true,
        finePointer: false,
        saveData: true,
      });
      expect(preferences.get()).toMatchObject({
        reducedMotion: true,
        finePointer: false,
        saveData: true,
      });
    });

    it("notifies subscribers when the device starts asking to save data", () => {
      const { preferences, controls } = create();
      controls.set({ saveData: false });
      const seen: DevicePreferencesValue[] = [];
      preferences.subscribe((value) => seen.push(value));
      controls.set({ saveData: true });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.saveData).toBe(true);
      controls.set({ saveData: true });
      expect(seen).toHaveLength(1);
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
