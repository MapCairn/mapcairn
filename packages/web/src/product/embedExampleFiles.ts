// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import indexHtml from "./embed/index.html?raw";
import mainTsx from "./embed/main.tsx.txt?raw";
import pageCss from "./embed/page.css.txt?raw";

/** One file of the embedding example: its path in a Vite project, its language and its source. */
export interface EmbedFile {
  readonly name: string;
  readonly language: string;
  readonly code: string;
}

/**
 * The README's "Embed a map" app, as the product page, `/index.md` and
 * `/llms-full.txt` show it: the three files of a Vite and React project, in the
 * order a reader makes them, each exactly as the README gives it. They are
 * plain files in `embed/`, read as text and never compiled here, because the
 * SDK's umbrella package is not imported anywhere under `packages/`
 * (`.dependency-cruiser.cjs`); `main.tsx` and `page.css` carry a `.txt` ending so no tool reads them as source or as a style sheet.
 * Two tests keep them true: `packages/core/src/lint/readme.test.ts`
 * type-checks the README's `main.tsx` as an app outside the repository would,
 * and `ProductPage.test.tsx` holds each of these files equal to the README's
 * block.
 */
export const EMBED_EXAMPLE_FILES: readonly EmbedFile[] = [
  { name: "index.html", language: "html", code: indexHtml.trimEnd() },
  { name: "src/page.css", language: "css", code: pageCss.trimEnd() },
  { name: "src/main.tsx", language: "tsx", code: mainTsx.trimEnd() },
];
