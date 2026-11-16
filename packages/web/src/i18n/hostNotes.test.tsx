// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPage } from "../app/PrivacyPage";
import { AF_CATALOGUE } from "./af";

const SETTINGS_PRIVACY_NOTE = EN_GB_CATALOGUE["host.notes.privacy"];
const PIN_LOOKUP_NOTE = EN_GB_CATALOGUE["host.notes.pinLookup"];
const AF_NOTES: readonly string[] = [
  AF_CATALOGUE["host.notes.privacy"],
  AF_CATALOGUE["host.notes.pinLookup"],
];

/** Collapses line wraps and runs of spaces, as the copies wrap differently. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const policy = collapse(
  readFileSync(resolve(__dirname, "../../../../PRIVACY.md"), "utf8"),
);
const page = collapse(render(<PrivacyPage />).container.textContent ?? "");

/**
 * Facts the in-app notes state that the privacy page and `PRIVACY.md` must
 * state too. The three copies word them differently, so each is a pattern.
 */
const SHARED_FACTS: ReadonlyArray<{
  readonly fact: string;
  readonly pattern: RegExp;
  readonly notes: readonly string[];
}> = [
  {
    fact: "an address lookup goes to Nominatim",
    pattern: /Nominatim/,
    notes: [SETTINGS_PRIVACY_NOTE, PIN_LOOKUP_NOTE],
  },
  {
    fact: "an address lookup sends the pin's position to about 11 m",
    pattern: /11 m/,
    notes: [SETTINGS_PRIVACY_NOTE, PIN_LOOKUP_NOTE],
  },
  {
    fact: "the text typed in search is sent to Photon, run by komoot, as it is typed",
    pattern: /Photon[\s\S]*komoot|komoot[\s\S]*Photon/,
    notes: [SETTINGS_PRIVACY_NOTE],
  },
  {
    fact: "the site sets no cookies",
    pattern: /cookies/,
    notes: [SETTINGS_PRIVACY_NOTE],
  },
  {
    fact: "a typed pair of coordinates is not sent to the geocoder",
    pattern: /pair of coordinates/,
    notes: [SETTINGS_PRIVACY_NOTE],
  },
];

describe("the host's privacy notes", () => {
  it("say what the reference site has always said, word for word", () => {
    expect(PIN_LOOKUP_NOTE).toBe(
      "Sends the pin's position, to about 11 m, to OpenStreetMap's Nominatim service.",
    );
    expect(SETTINGS_PRIVACY_NOTE).toBe(
      "MapCairn has no accounts, sets no cookies and counts page views without tracking you. Map tiles come from the map provider you choose. As you type in search, the text so far is sent to the Photon service, run by komoot, to suggest places. Pressing Enter or Search sends your query to OpenStreetMap's Nominatim service, and Look up address on a pin sends the pin's position, to about 11 m, to Nominatim too. Nothing is sent to either service until you type in search or ask for an address, and a pair of coordinates typed in search is not sent to them, though showing the place loads map tiles for that area, as any move of the map does. A data layer contacts its provider only while it is on. Your settings stay on this device.",
    );
  });

  it.each(SHARED_FACTS)(
    "agree with the privacy page and PRIVACY.md that $fact",
    ({ pattern, notes }) => {
      for (const note of notes) {
        expect(note).toMatch(pattern);
      }
      expect(page).toMatch(pattern);
      expect(policy).toMatch(pattern);
    },
  );

  it("state the same facts in Afrikaans", () => {
    const [privacy, pinLookup] = AF_NOTES;
    expect(privacy).toMatch(/Nominatim/);
    expect(privacy).toMatch(/Photon[\s\S]*komoot|komoot[\s\S]*Photon/);
    expect(privacy).toMatch(/koekies/);
    expect(privacy).toMatch(/11 m/);
    expect(privacy).toMatch(/koördinate/);
    expect(pinLookup).toMatch(/Nominatim/);
    expect(pinLookup).toMatch(/11 m/);
    expect(AF_CATALOGUE["host.notes.routing"]).toMatch(
      /Valhalla[\s\S]*FOSSGIS/,
    );
    expect(AF_CATALOGUE["host.notes.routing"]).toMatch(/IP-adres/);
  });
});
