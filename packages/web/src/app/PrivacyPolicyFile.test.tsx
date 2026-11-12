import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Settings } from "@mapcairn/core";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocalStorageSettingsStore } from "../adapters/settings/LocalStorageSettingsStore";
import { LAST_UPDATED, PrivacyPage } from "./PrivacyPage";

/** Collapses line wraps and runs of spaces, as the two copies wrap differently. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The root `PRIVACY.md` as written. */
const policyFile = readFileSync(
  resolve(__dirname, "../../../../PRIVACY.md"),
  "utf8",
);

/** The root `PRIVACY.md` with line wraps and runs of spaces collapsed. */
const policy = collapse(policyFile);

/** The text of one `##` section of `PRIVACY.md`, collapsed. */
function fileSection(heading: string): string {
  const start = policyFile.indexOf(`## ${heading}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = policyFile.indexOf("\n## ", start + 1);
  return collapse(policyFile.slice(start, end === -1 ? undefined : end));
}

/** The text of the rendered page, collapsed. */
function pageText(): string {
  return collapse(render(<PrivacyPage />).container.textContent ?? "");
}

/** The text of one section of the rendered page: its heading's next paragraph. */
function pageSection(heading: string): string {
  const { container } = render(<PrivacyPage />);
  const title = within(container).getByRole("heading", {
    name: heading,
    level: 2,
  });
  return collapse(title.nextElementSibling?.textContent ?? "");
}

/** Asserts the page and `PRIVACY.md` both state this sentence. */
function expectBothCopies(sentence: string): void {
  expect(policy).toContain(sentence);
  expect(pageText()).toContain(sentence);
}

describe("PRIVACY.md mirrors the privacy page", () => {
  it("states the same last-updated date as the page", () => {
    expect(policy).toContain(`_Last updated: ${LAST_UPDATED}_`);
  });

  it("names every basemap tile provider that may log a request", () => {
    expectBothCopies(
      "The basemap tile providers, OpenFreeMap, the OpenStreetMap Foundation when you choose the Streets basemap, OpenTopoMap when you choose the Topographic basemap, and EOX IT Services when you choose the Satellite basemap, may log tile requests, including your IP address, as part of serving the map.",
    );
    expectBothCopies(
      "Your browser makes those requests itself: they carry your IP address, its usual request headers (such as its user agent) and this site's address as the referrer, and nothing this site has stored about you.",
    );
  });

  it("says tile requests show which part of the map is on screen", () => {
    expectBothCopies(
      "Tiles are requested for the part of the map on screen, so the basemap's provider, and the provider of any tile layer you turn on, can tell roughly which area you are looking at, and after Locate me roughly where you are.",
    );
  });

  it("says a search that is only coordinates is not sent to the geocoder", () => {
    expectBothCopies(
      "A search that is only a pair of coordinates is read in your browser and is not sent to the geocoder; showing the place requests map tiles for that area, as any move of the map does.",
    );
  });

  it("says the assistant tools send place names as a search does", () => {
    expectBothCopies(
      "If an assistant in your browser uses this site's search or measuring tools (through WebMCP), the place names it gives are sent to Nominatim in the same way, and a pair of coordinates is again read in your browser.",
    );
  });

  it("names NASA's imagery service for every layer that loads from it", () => {
    expectBothCopies(
      "NASA's Global Imagery Browse Services for its imagery layers (satellite imagery, rainfall, fire hotspots, where people live, Earth at night and sea temperature)",
    );
  });

  it("says the first-visit tour keeps one number and sends nothing", () => {
    expect(policy).toContain(
      "whether you have answered the first-visit tour (a version number under `mapcairn:tourSeen`)",
    );
    expectBothCopies(
      "The tour itself sends nothing; a layer you turn on during it loads from its provider as described below.",
    );
  });

  it("has no section or link for VersaTiles, Maptoolkit or Mapterhorn", () => {
    expect(policy).not.toMatch(/VersaTiles|Maptoolkit|Mapterhorn/);
  });
});

/**
 * How the privacy policy names each stored setting. A new setting fails
 * typecheck here until the policy says what it keeps.
 * @remarks Covers only what `LocalStorageSettingsStore` writes; storage
 *   written anywhere else is not checked here.
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

/**
 * A value for every setting. Each must differ from the store's default, or
 * the store would not write it; a test below checks that it does.
 */
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

/** A settings store over an in-memory `Storage`, and that storage's entries. */
function recordingStore(): {
  store: LocalStorageSettingsStore;
  values: Map<string, string>;
} {
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
  return { store, values };
}

describe("the privacy policy's local storage list", () => {
  it("is tested with a value other than the default for every setting", () => {
    const defaults = recordingStore().store.get();
    for (const name of Object.keys(POLICY_WORDS) as (keyof Settings)[]) {
      expect(EVERY_SETTING[name], name).not.toEqual(defaults[name]);
    }
  });

  it("names every key the settings store writes", () => {
    const { store, values } = recordingStore();
    store.set(EVERY_SETTING);
    const keys = [...values.keys()];
    expect(keys.every((key) => key.startsWith("mapcairn:"))).toBe(true);
    expect(keys.map((key) => key.slice("mapcairn:".length)).sort()).toEqual(
      Object.keys(POLICY_WORDS).sort(),
    );
  });

  it("says what each setting keeps, in the Local storage section of both copies", () => {
    const page = pageSection("Local storage");
    const file = fileSection("Local storage");
    for (const words of Object.values(POLICY_WORDS)) {
      expect(page).toContain(words);
      expect(file).toContain(words);
    }
  });
});
