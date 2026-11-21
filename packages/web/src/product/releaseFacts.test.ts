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
  it("is the first version heading, with its date", () => {
    expect(
      latestRelease(
        "# Changelog\n\nIntro.\n\n## 0.2.0-rc.1 (2027-01-05)\n\nText.\n\n## 0.1.0 (2026-11-21)\n",
      ),
    ).toEqual({ version: "0.2.0-rc.1", date: "2027-01-05" });
  });

  it("skips a heading that is not a release, such as one for unreleased changes", () => {
    expect(
      latestRelease("## Unreleased\n\n- a\n\n## 1.0.0 (2027-03-01)\n"),
    ).toEqual({ version: "1.0.0", date: "2027-03-01" });
  });

  it("fails the build when the changelog names no release, rather than show a guess", () => {
    expect(() => latestRelease("# Changelog\n\n## Unreleased\n")).toThrow(
      /no release heading/i,
    );
  });

  it("is what the repository's own changelog says first", () => {
    const first = CHANGELOG.match(/^## (\S+) \((\d{4}-\d{2}-\d{2})\)$/m);
    expect(RELEASE).toEqual({ version: first?.[1], date: first?.[2] });
  });

  it("writes the date in British English, with the month in words, the same in every time zone", () => {
    expect(formatReleaseDate("2026-11-21")).toBe("21 November 2026");
    expect(formatReleaseDate("2027-01-05")).toBe("5 January 2027");
  });

  it("refuses a date that is not a calendar date", () => {
    expect(() => formatReleaseDate("2026-13-01")).toThrow(/not a date/i);
    expect(() => formatReleaseDate("21 Nov")).toThrow(/not a date/i);
  });
});
