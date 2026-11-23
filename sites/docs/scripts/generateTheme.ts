// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens, tokenValues } from "@mapcairn/theme";
import { buildSyntaxCss } from "./syntaxCss";
import { buildThemeCss } from "./themeCss";

/** Where the generated stylesheets go. They are git-ignored. */
const OUTPUT = fileURLToPath(
  new URL("../src/css/generated/infima.css", import.meta.url),
);
const SYNTAX_OUTPUT = fileURLToPath(
  new URL("../src/css/generated/syntax.css", import.meta.url),
);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, buildThemeCss(tokens));
writeFileSync(SYNTAX_OUTPUT, buildSyntaxCss(tokenValues.syntaxPalette));
