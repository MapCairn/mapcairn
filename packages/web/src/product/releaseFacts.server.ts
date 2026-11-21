// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import changelog from "../../../../CHANGELOG.md?raw";
import { formatReleaseDate, type ReleaseFacts } from "./releaseDate";

/*
 * The product page's two trust facts that change with each release: the
 * latest version and the day it was released. Both come from the changelog in
 * the checkout the site is built from, so the build asks no service and the
 * page cannot show a version the repository has not released. The module is
 * server only (`.server.ts`): the route's loader and the Markdown twin read
 * it, and the changelog's text never reaches the browser.
 */

/** A section heading of the changelog: two hashes, not three. */
const SECTION_HEADING = /^## (.+)$/gm;

/** A release heading's text: `0.1.0 (2026-11-21)`, or a release candidate such as `0.2.0-rc.1 (2027-01-05)`. */
const RELEASE_TEXT = /^(\d+\.\d+\.\d+)(-[\w.]+)? \((\d{4}-\d{2}-\d{2})\)$/;

/**
 * The latest stable release a changelog names, newest first as the release
 * script writes it. Release candidates are skipped, so the page names what
 * `npm install` gives from the default tag. The build fails, rather than
 * show something older or wrong, when the first section is not a release
 * (such as one for unreleased changes), when no stable release is named, or
 * when a release's date is not a day the calendar has.
 */
export function latestRelease(text: string): ReleaseFacts {
  const headings = [...text.matchAll(SECTION_HEADING)].map(
    (match) => match[1] ?? "",
  );
  const [first] = headings;
  if (first !== undefined && !RELEASE_TEXT.test(first)) {
    throw new Error(
      `The changelog's first section is not a release: "${first}".`,
    );
  }
  for (const heading of headings) {
    const [, version, prerelease, date] = heading.match(RELEASE_TEXT) ?? [];
    if (
      version !== undefined &&
      date !== undefined &&
      prerelease === undefined
    ) {
      formatReleaseDate(date);
      return { version, date };
    }
  }
  throw new Error("The changelog names no stable release to read.");
}

/** The latest release of the SDK packages, as the checkout's changelog states it. */
export const RELEASE: ReleaseFacts = latestRelease(changelog);
