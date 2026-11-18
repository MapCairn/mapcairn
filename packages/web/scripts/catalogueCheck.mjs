// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
// Lists the keys a message catalogue is missing and the keys whose value is
// the same as the English one, so a translator knows what is left to do.
//
// Usage: npm run catalogue:check -- <language> <file> [export]
//          [--english <file>] [--english-export <export>]
//
// <file> is a JSON object of messages, or a TypeScript or JavaScript module
// (run through tsx); [export] names the export that holds the messages, and
// defaults to the module's only export, else its default export. The English
// to compare with is EN_GB_CATALOGUE, or a host's own English read the same
// way from --english and --english-export. A relative path is read from the
// folder npm was run in. A file that is not an object whose values are all
// text is refused with exit code 1. Otherwise it exits 0: the tests that call
// `checkMessageCatalogue` are the gate, and some values are rightly the same
// as English (a symbol, a name kept as published), which those tests allow
// and this list cannot know.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkMessageCatalogue, EN_GB_CATALOGUE } from "@mapcairn/core";

const USAGE =
  "Usage: npm run catalogue:check -- <language> <file> [export] [--english <file>] [--english-export <export>]";

/** Stops with `message` on standard error and exit code `code`. */
function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      english: { type: "string" },
      "english-export": { type: "string" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`, 2);
}
const [language, file, exportName] = args.positionals;
if (!language || !file) {
  fail(USAGE, 2);
}

/**
 * The messages in `source`: its JSON, or the export named `wanted`, else
 * its only or default export,
 * refused unless it is an object whose values are all text.
 */
async function readCatalogue(source, wanted) {
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), source);
  let messages;
  if (path.endsWith(".json")) {
    messages = JSON.parse(readFileSync(path, "utf8"));
  } else {
    const module = await import(pathToFileURL(path).href);
    const names = Object.keys(module);
    const name = wanted ?? (names.length === 1 ? names[0] : "default");
    if (module[name] === undefined) {
      fail(
        `${source} has no export named ${name}; its exports are ${names.join(", ")}.`,
      );
    }
    messages = module[name];
  }
  if (Array.isArray(messages)) {
    fail(`${source} is a list, not an object of messages.`);
  }
  if (typeof messages !== "object" || messages === null) {
    fail(`${source} is not an object of messages.`);
  }
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value !== "string") {
      fail(`${source} has a value for "${key}" that is not text.`);
    }
  }
  return messages;
}

const catalogue = await readCatalogue(file, exportName);
const english = args.values.english
  ? await readCatalogue(args.values.english, args.values["english-export"])
  : EN_GB_CATALOGUE;
const problems = checkMessageCatalogue(language, catalogue, english);
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
