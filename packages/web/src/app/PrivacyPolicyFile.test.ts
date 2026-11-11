import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LAST_UPDATED } from "./PrivacyPage";

/** The root `PRIVACY.md` with line wraps and runs of spaces collapsed. */
const policy = readFileSync(
  resolve(__dirname, "../../../../PRIVACY.md"),
  "utf8",
)
  .replace(/\s+/g, " ")
  .trim();

describe("PRIVACY.md mirrors the privacy page", () => {
  it("states the same last-updated date as the page", () => {
    expect(policy).toContain(`_Last updated: ${LAST_UPDATED}_`);
  });

  it("names every basemap tile provider that may log a request", () => {
    expect(policy).toContain(
      "The basemap tile providers, OpenFreeMap, VersaTiles when you choose the Colorful basemap, and the OpenStreetMap Foundation when you choose the Streets basemap, may log tile requests, including your IP address, as part of serving the map.",
    );
    expect(policy).toContain(
      "Your browser makes those requests itself: they carry your IP address, its usual request headers (such as its user agent) and this site's address as the referrer, and nothing this site has stored about you. VersaTiles says it logs requests in anonymised form and uses the logs only to track down faults and detect misuse.",
    );
  });

  it("has no section or link for Maptoolkit or Mapterhorn", () => {
    expect(policy).not.toMatch(/Maptoolkit|Mapterhorn/);
  });
});
