// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * English-only text the interface may write inline. Every entry names a file,
 * says why the text is not looked up through the message catalogue, and may
 * name one exact text; an entry without `text` covers the whole file. A stale
 * entry (one that matches nothing) fails the test, so the list cannot outlive
 * the text it excuses.
 *
 * Everything a visitor can see in the host app is in the catalogue, the
 * privacy page included. The four design guide entries stay: that guide is
 * built only in development and test builds, so no visitor sees it, and the
 * only other entry is the product name in the hidden page heading.
 *
 * @type {ReadonlyArray<{ file: string, text?: string, reason: string }>}
 */
export const COPY_ALLOWLIST = [
  {
    file: "packages/web/src/designGuide/ComponentSections.tsx",
    reason:
      "The developer design guide exists only in development and test builds and is not shown to visitors; see #271.",
  },
  {
    file: "packages/web/src/designGuide/DesignGuide.tsx",
    reason:
      "The developer design guide exists only in development and test builds and is not shown to visitors; see #271.",
  },
  {
    file: "packages/web/src/designGuide/FontSection.tsx",
    reason:
      "The developer design guide exists only in development and test builds and is not shown to visitors; see #271.",
  },
  {
    file: "packages/web/src/designGuide/FoundationSections.tsx",
    reason:
      "The developer design guide exists only in development and test builds and is not shown to visitors; see #271.",
  },
  {
    file: "packages/web/src/routes/home.tsx",
    text: "MapCairn",
    reason:
      "The product name in the visually hidden page heading, spelt the same in every language.",
  },
];
