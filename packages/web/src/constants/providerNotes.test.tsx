import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPage } from "../app/PrivacyPage";
import { PIN_LOOKUP_NOTE, SETTINGS_PRIVACY_NOTE } from "./providerNotes";

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
      "MapCairn has no accounts, sets no cookies and counts page views without tracking you. Map tiles come from the map provider you choose. Searching sends your query to OpenStreetMap's Nominatim service, and Look up address on a pin sends the pin's position, to about 11 m, to the same service. Nothing is sent to it until you do one of those, and a pair of coordinates typed in search is not sent to it, though showing the place loads map tiles for that area, as any move of the map does. A data layer contacts its provider only while it is on. Your settings stay on this device.",
    );
  });

  it.each(SHARED_FACTS)("agree with the privacy page and PRIVACY.md that $fact", ({
    pattern,
    notes,
  }) => {
    for (const note of notes) {
      expect(note).toMatch(pattern);
    }
    expect(page).toMatch(pattern);
    expect(policy).toMatch(pattern);
  });
});
