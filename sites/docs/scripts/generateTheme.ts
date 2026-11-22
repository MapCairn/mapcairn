// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@mapcairn/theme";
import { buildThemeCss } from "./themeCss";

/** Where the generated stylesheet goes. It is git-ignored. */
const OUTPUT = fileURLToPath(
  new URL("../src/css/generated/infima.css", import.meta.url),
);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, buildThemeCss(tokens));
