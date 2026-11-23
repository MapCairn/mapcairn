// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenValues } from "@mapcairn/theme";
import { buildDesignTokensCss } from "./designTokensCss";
import { buildDesignTokensPage } from "./designTokensPage";

/** The visual design page, written into the docs folder. It is git-ignored. */
const PAGE_FILE = fileURLToPath(
  new URL("../docs/design-visual.md", import.meta.url),
);

/** The stylesheet the page needs, written beside the other generated ones. It is git-ignored. */
const CSS_FILE = fileURLToPath(
  new URL("../src/css/generated/design-tokens.css", import.meta.url),
);

mkdirSync(dirname(CSS_FILE), { recursive: true });
writeFileSync(PAGE_FILE, buildDesignTokensPage(tokenValues));
writeFileSync(CSS_FILE, buildDesignTokensCss(tokenValues));
console.log("Design tokens page and stylesheet written.");
