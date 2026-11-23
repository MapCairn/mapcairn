// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  type DevicePreferencesSubject,
  runDevicePreferencesContract,
} from "../contracts/devicePreferences.contract";
import { FakeDevicePreferences } from "./FakeDevicePreferences";

runDevicePreferencesContract(
  "FakeDevicePreferences",
  (): DevicePreferencesSubject => {
    const preferences = new FakeDevicePreferences();
    return {
      preferences,
      controls: { set: (patch) => preferences.set(patch) },
    };
  },
);

describe("FakeDevicePreferences", () => {
  it("defaults to a fine pointer, no reduced motion, no languages and online", () => {
    expect(new FakeDevicePreferences().get()).toEqual({
      reducedMotion: false,
      finePointer: true,
      languages: [],
      online: true,
    });
  });

  it("accepts starting values", () => {
    expect(
      new FakeDevicePreferences({
        reducedMotion: true,
        finePointer: false,
        languages: ["af-ZA", "en"],
        online: false,
      }).get(),
    ).toEqual({
      reducedMotion: true,
      finePointer: false,
      languages: ["af-ZA", "en"],
      online: false,
    });
  });

  it("notifies when the languages change, and not when the same list is set again", () => {
    const preferences = new FakeDevicePreferences({ languages: ["en"] });
    const seen: string[][] = [];
    preferences.subscribe((value) => {
      seen.push([...value.languages]);
    });
    preferences.set({ languages: ["en"] });
    expect(seen).toHaveLength(0);
    preferences.set({ languages: ["af", "en"] });
    expect(seen).toEqual([["af", "en"]]);
  });
});
