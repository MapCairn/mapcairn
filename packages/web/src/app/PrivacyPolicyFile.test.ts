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
      "The basemap tile providers, OpenFreeMap, the OpenStreetMap Foundation when you choose the Streets basemap, and Maptoolkit and Mapterhorn when you choose Maptoolkit Dark (see below), may log tile requests, including your IP address, as part of serving the map.",
    );
  });

  it("describes the Maptoolkit Dark section: when it sends, to whom, and what it keeps", () => {
    expect(policy).toContain("## Maptoolkit Dark basemap");
    expect(policy).toContain(
      "Nothing is sent to Maptoolkit unless you choose the Maptoolkit Dark basemap.",
    );
    for (const host of [
      "styles.maptoolkit.org",
      "tiles.maptoolkit.org",
      "icons.maptoolkit.org",
      "fonts.maptoolkit.org",
      "tiles.mapterhorn.com",
    ]) {
      expect(policy, host).toContain(host);
    }
    expect(policy).toContain("this site's origin (no page path)");
    expect(policy).toContain("up to 30 days");
    expect(policy).toContain("so Save image is off while it is shown");
  });

  it("links both providers' privacy policies", () => {
    expect(policy).toContain("(https://www.maptoolkit.com/privacy/)");
    expect(policy).toContain("(https://mapterhorn.com/privacy-policy/)");
  });
});
