// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatReleaseDate } from "./releaseDate";
import { latestRelease, RELEASE } from "./releaseFacts.server";

/** The repository's changelog, as the build reads it. */
const CHANGELOG = readFileSync(
  path.resolve(__dirname, "../../../../CHANGELOG.md"),
  "utf8",
);

describe("the latest release, read from the changelog in the checkout", () => {
  it("is the first stable version heading, with its date, skipping release candidates above it", () => {
    expect(
      latestRelease(
        "# Changelog\n\nIntro.\n\n## 0.2.0-rc.1 (2027-01-05)\n\nText.\n\n## 0.1.0 (2026-11-21)\n\n## 0.1.0-rc.3 (2026-11-21)\n",
      ),
    ).toEqual({ version: "0.1.0", date: "2026-11-21" });
  });

  it("ignores a heading of three hashes or more, which belongs inside a release", () => {
    expect(latestRelease("## 1.0.0 (2027-03-01)\n\n### What is new\n")).toEqual(
      { version: "1.0.0", date: "2027-03-01" },
    );
  });

  it("fails the build when the first section is not a release, such as one for unreleased changes, rather than show an older one", () => {
    expect(() =>
      latestRelease("## Unreleased\n\n- a\n\n## 1.0.0 (2027-03-01)\n"),
    ).toThrow(/first section .*not a release/i);
  });

  it("fails the build when the changelog names no stable release", () => {
    expect(() =>
      latestRelease("# Changelog\n\n## 0.1.0-rc.1 (2026-11-20)\n"),
    ).toThrow(/no stable release/i);
    expect(() => latestRelease("# Changelog\n")).toThrow(/no stable release/i);
  });

  it("fails the build on a release dated with a day that does not exist", () => {
    expect(() => latestRelease("## 1.0.0 (2026-02-31)\n")).toThrow(
      /not a date/i,
    );
  });

  it("is what the repository's own changelog says first", () => {
    const first = CHANGELOG.match(
      /^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)$/m,
    );
    expect(RELEASE).toEqual({ version: first?.[1], date: first?.[2] });
  });

  it("writes the date in British English, with the month in words, the same in every time zone", () => {
    expect(formatReleaseDate("2026-11-21")).toBe("21 November 2026");
    expect(formatReleaseDate("2027-01-05")).toBe("5 January 2027");
    expect(formatReleaseDate("2028-02-29")).toBe("29 February 2028");
  });

  it("refuses a date that is not a calendar date", () => {
    for (const date of [
      "2026-13-01",
      "21 Nov",
      "2026-02-29",
      "2026-04-31",
      "2026-00-10",
      "2026-01-00",
    ]) {
      expect(() => formatReleaseDate(date), date).toThrow(/not a date/i);
    }
  });
});
