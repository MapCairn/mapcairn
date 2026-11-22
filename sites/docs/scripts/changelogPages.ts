// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SidebarEntry } from "./docChecks";

const RELEASE_HEADING = /^## (\S+) \((\d{4}-\d{2}-\d{2})\)\s*$/;
const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^(#{2,6}) /;
const FIRST_SENTENCE = /^([\s\S]*?[.!?])(?=\s+[A-Z]|$)/;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const MARKDOWN_MARKS = /[`*_]/g;

/** One release in `CHANGELOG.md`. */
export interface Release {
  readonly version: string;
  /** The release date as written, `YYYY-MM-DD`. */
  readonly date: string;
  /** The text under the release heading, with its own headings at level three. */
  readonly body: string;
}

/** The pages and sidebar entry the changelog makes. */
export interface Changelog {
  /** Page text by file name, relative to the changelog folder. */
  readonly files: ReadonlyMap<string, string>;
  readonly sidebar: SidebarEntry;
}

/**
 * Reads the releases from `CHANGELOG.md`, in the order the file holds them
 * (newest first). A release starts at a `## <version> (<date>)` heading; a
 * heading inside a code block does not count.
 * @param text - The text of `CHANGELOG.md`.
 */
export function parseChangelog(text: string): Release[] {
  const releases: { version: string; date: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    }
    const heading = inFence ? null : RELEASE_HEADING.exec(line);
    if (heading) {
      releases.push({
        version: heading[1] ?? "",
        date: heading[2] ?? "",
        lines: [],
      });
    } else {
      releases.at(-1)?.lines.push(line);
    }
  }
  return releases.map(({ version, date, lines }) => ({
    version,
    date,
    body: lines.join("\n").trim(),
  }));
}

/** The date as people write it in British English, such as `22 November 2026`. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** The first paragraph of prose in a body: not a heading, a list, a code block or a table. */
function firstParagraph(body: string): string {
  let inFence = false;
  const paragraph: string[] = [];
  for (const line of body.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
    } else if (!inFence && line.trim() === "") {
      if (paragraph.length > 0) {
        break;
      }
    } else if (!inFence && /^(?:#|[-*|] |\d+\. )/.test(line)) {
      if (paragraph.length > 0) {
        break;
      }
    } else if (!inFence) {
      paragraph.push(line.trim());
    }
  }
  return paragraph.join(" ");
}

/** The page's description: the first sentence of the release's first paragraph, as plain text. */
function descriptionOf(release: Release): string {
  const plain = firstParagraph(release.body)
    .replace(MARKDOWN_LINK, "$1")
    .replace(MARKDOWN_MARKS, "");
  const sentence = FIRST_SENTENCE.exec(plain)?.[1] ?? plain;
  return sentence === "" ? `What changed in ${release.version}.` : sentence;
}

const UNMARKED_CODE_FENCE = /^(\s*(?:```|~~~)(?:ts|tsx))\s*$/;

/**
 * The body made ready for a page: each heading moved up one level, so the
 * page's own title is the only level one, and each `ts` or `tsx` block with
 * no marker marked `no-check`, because it was written for that release and
 * the snippet check compiles only against the current packages.
 */
function prepareBody(body: string): string {
  let inFence = false;
  return body
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return inFence
          ? line.replace(UNMARKED_CODE_FENCE, "$1 no-check")
          : line;
      }
      return inFence
        ? line
        : line.replace(HEADING, (_, marks: string) => `${marks.slice(1)} `);
    })
    .join("\n");
}

/**
 * The page for one release: front matter, the date and the notes.
 * @param release - A release from {@link parseChangelog}.
 */
export function releasePage(release: Release): string {
  const { version, date } = release;
  return `---

title: ${JSON.stringify(`Release ${version}`)}
sidebar_label: ${JSON.stringify(version)}
description: ${JSON.stringify(descriptionOf(release))}
---

# Release ${version}

Released on ${formatDate(date)}.

${prepareBody(release.body)}
`;
}

function indexPage(releases: readonly Release[]): string {
  const items = releases.map(
    ({ version, date }) => `- [${version}](${version}.md), ${formatDate(date)}`,
  );
  return `---

title: Changelog
sidebar_label: Changelog
description: What changed in each release of the SDK packages, newest first, with a page for each release.
---

# Changelog

This page is for a developer who uses the SDK and wants to know what a release changed. The six SDK packages are released together under one version, so each release has one page that covers all of them. Each page says what you can now do and what to change when you upgrade.

The pages are written from \`CHANGELOG.md\` in the repository when the site is built. A code sample in a release's notes is the code of that release, so it is not compiled against the current packages.

${items.join("\n")}
`;
}

/**
 * Builds the changelog's pages from `CHANGELOG.md`: an index and one page for
 * each release, with the sidebar entry that lists them.
 * @param text - The text of `CHANGELOG.md`.
 * @throws When the text holds no release.
 */
export function buildChangelog(text: string): Changelog {
  const releases = parseChangelog(text);
  if (releases.length === 0) {
    throw new Error("CHANGELOG.md has no release.");
  }
  const files = new Map<string, string>([["index.md", indexPage(releases)]]);
  for (const release of releases) {
    files.set(`${release.version}.md`, releasePage(release));
  }
  return {
    files,
    sidebar: {
      type: "category",
      label: "Changelog",
      link: { type: "doc", id: "changelog/index" },
      items: releases.map(({ version }) => `changelog/${version}`),
    },
  };
}
