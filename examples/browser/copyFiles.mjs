// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Copies the files of `@mapcairn/sdk/browser` that a page serves into
 * `./mapcairn`: `browser.css` and every `browser*.js` beside it. The page
 * loads them from there, so any static server can serve it.
 *
 *   node copyFiles.mjs
 */
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const from = path.dirname(
  createRequire(import.meta.url).resolve("@mapcairn/sdk/browser"),
);
const to = path.join(import.meta.dirname, "mapcairn");
mkdirSync(to, { recursive: true });
for (const file of readdirSync(from)) {
  if (/^browser(?:-[\w-]+)?\.js$|^browser\.css$/.test(file)) {
    cpSync(path.join(from, file), path.join(to, file));
  }
}
