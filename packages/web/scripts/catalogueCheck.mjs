// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Lists the keys a message catalogue is missing and the keys whose value is
// the same as the English one, so a translator knows what is left to do.
//
// Usage: npm run catalogue:check -- <language> <file> [export]
//
// <file> is a JSON object of messages, or a TypeScript or JavaScript module
// (run through tsx); [export] names the export that holds the messages, and
// defaults to the module's only export, else its default export. A relative
// path is read from the folder npm was run in. It always exits 0 once the
// catalogue is read: the tests that call `checkMessageCatalogue` are the gate,
// and some values are rightly the same as English (a symbol, a name kept as
// published), which those tests allow and this list cannot know.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/core";

const [language, file, exportName] = process.argv.slice(2);
if (!language || !file) {
  console.error("Usage: npm run catalogue:check -- <language> <file> [export]");
  process.exit(2);
}

const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);

/** The messages in `path`: its JSON, or the named, only or default export. */
async function readCatalogue() {
  if (path.endsWith(".json")) {
    return JSON.parse(readFileSync(path, "utf8"));
  }
  const module = await import(pathToFileURL(path).href);
  const names = Object.keys(module);
  const name = exportName ?? (names.length === 1 ? names[0] : "default");
  if (module[name] === undefined) {
    throw new Error(
      `${file} has no export named ${name}; its exports are ${names.join(", ")}.`,
    );
  }
  return module[name];
}

const catalogue = await readCatalogue();
const problems = checkMessageCatalogue(language, catalogue, EN_GB_CATALOGUE);
const keysWith = (kind) =>
  problems.filter(({ problem }) => problem === kind).map(({ key }) => key);
const missing = keysWith("missing");
const copied = keysWith("copiedEnglish");

console.log(
  `${language}: ${missing.length} missing, ${copied.length} the same as English`,
);
if (missing.length > 0) {
  console.log("\nMissing:");
  for (const key of missing) {
    console.log(`  ${key}`);
  }
}
if (copied.length > 0) {
  console.log(
    "\nThe same as English (check each: a symbol or a name kept as published can be right):",
  );
  for (const key of copied) {
    console.log(`  ${key}`);
  }
}
