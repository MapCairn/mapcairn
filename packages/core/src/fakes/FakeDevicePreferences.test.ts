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
  it("defaults to a fine pointer, no reduced motion and no save-data request", () => {
    expect(new FakeDevicePreferences().get()).toEqual({
      reducedMotion: false,
      finePointer: true,
      saveData: false,
    });
  });

  it("accepts starting values", () => {
    expect(
      new FakeDevicePreferences({
        reducedMotion: true,
        finePointer: false,
        saveData: true,
      }).get(),
    ).toEqual({ reducedMotion: true, finePointer: false, saveData: true });
  });
});
