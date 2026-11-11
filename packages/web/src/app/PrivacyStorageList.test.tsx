import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Settings } from "@mapcairn/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalStorageSettingsStore } from "../adapters/settings/LocalStorageSettingsStore";
import { PrivacyPage } from "./PrivacyPage";

/**
 * How the privacy policy names each stored setting. A new setting fails
 * typecheck here until the policy says what it keeps.
 */
const POLICY_WORDS: Readonly<Record<keyof Settings, string>> = {
  theme: "your light or dark theme",
  units: "your units",
  zoomButtons: "whether the zoom buttons show",
  saveData: "whether Save data is on",
  projection: "whether the map is flat or a globe",
  basemapId: "your chosen basemap",
  lastView: "where the map was last left",
  tourSeen: "whether you have answered the first-visit tour",
};

/** A value for every setting other than its default, so each one is written. */
const EVERY_SETTING: Settings = {
  theme: "dark",
  units: "imperial",
  zoomButtons: true,
  saveData: true,
  projection: "globe",
  basemapId: "positron",
  lastView: { center: { lat: 1, lng: 2 }, zoom: 3, bearing: 0 },
  tourSeen: 1,
};

/** Collapses line wraps and runs of spaces, as both copies wrap differently. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The keys the real settings store writes when every setting is changed. */
function writtenKeys(): string[] {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  } as unknown as Storage;
  const store = new LocalStorageSettingsStore({
    getStorage: () => storage,
    events: undefined,
  });
  store.set(EVERY_SETTING);
  return [...values.keys()];
}

describe("the privacy policy's local storage list", () => {
  it("names every key the settings store writes", () => {
    const keys = writtenKeys();
    expect(keys.every((key) => key.startsWith("mapcairn:"))).toBe(true);
    expect(keys.map((key) => key.slice("mapcairn:".length)).sort()).toEqual(
      Object.keys(POLICY_WORDS).sort(),
    );
  });

  it("says what each setting keeps, on the page and in PRIVACY.md", () => {
    const page = collapse(render(<PrivacyPage />).container.textContent ?? "");
    const file = collapse(
      readFileSync(resolve(__dirname, "../../../../PRIVACY.md"), "utf8"),
    );
    for (const words of Object.values(POLICY_WORDS)) {
      expect(page).toContain(words);
      expect(file).toContain(words);
    }
  });
});
