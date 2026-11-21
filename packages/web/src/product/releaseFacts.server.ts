// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import changelog from "../../../../CHANGELOG.md?raw";
import type { ReleaseFacts } from "./releaseDate";

/*
 * The product page's two trust facts that change with each release: the
 * latest version and the day it was released. Both come from the changelog in
 * the checkout the site is built from, so the build asks no service and the
 * page cannot show a version the repository has not released. The module is
 * server only (`.server.ts`): the route's loader and the Markdown twin read
 * it, and the changelog's text never reaches the browser.
 */

/** A release heading: `## 0.1.0 (2026-11-21)`. */
const RELEASE_HEADING =
  /^## (\d+\.\d+\.\d+(?:-[\w.]+)?) \((\d{4}-\d{2}-\d{2})\)$/m;

/**
 * The first release heading of a changelog, newest first as the release
 * script writes it. A heading that is not a release (such as "Unreleased") is
 * skipped; a changelog with no release fails the build rather than show a
 * guess.
 */
export function latestRelease(text: string): ReleaseFacts {
  const match = text.match(RELEASE_HEADING);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error("The changelog has no release heading to read.");
  }
  return { version: match[1], date: match[2] };
}

/** The latest release of the SDK packages, as the checkout's changelog states it. */
export const RELEASE: ReleaseFacts = latestRelease(changelog);
