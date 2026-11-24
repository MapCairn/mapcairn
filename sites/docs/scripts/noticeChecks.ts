// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The copyright lines of the MIT-licensed code the site's scripts bundle, as
 * they appear in `ATTRIBUTIONS.md`. The rspack build writes no
 * `*.LICENSE.txt` files and keeps no `@license` comment, so the notices are
 * published there instead. Change this list with that section.
 */
export const BUNDLED_NOTICE_HOLDERS: readonly string[] = [
  "Copyright (c) Meta Platforms, Inc. and affiliates.",
  "Copyright (c) Facebook, Inc. and its affiliates.",
  "Copyright (c) 2014-present, Facebook, Inc.",
  "Copyright (c) 2013-2014 Rico Sta. Cruz",
];

/** A phrase every copy of the MIT licence text carries. */
const LICENCE_TEXT_MARKER = "Permission is hereby granted, free of charge";

/** The suffix of the notice files a bundler may write beside its scripts. */
const NOTICE_FILE_SUFFIX = ".LICENSE.txt";

/**
 * Every licence notice file a bundler wrote under the build, relative to it
 * with forward slashes.
 * @param root - The build folder.
 */
export function noticeFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(NOTICE_FILE_SUFFIX)) {
        files.push(relative(root, path).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return files;
}

/**
 * What is wrong with how the build's third-party notices are handled: a
 * bundler that writes notice files again (so the published list may be out of
 * date), a holder that `ATTRIBUTIONS.md` does not name, or no licence text.
 * @param build - The build folder.
 * @param attributions - The text of `ATTRIBUTIONS.md`.
 */
export function noticeFindings(build: string, attributions: string): string[] {
  const findings = noticeFiles(build).map(
    (file) =>
      `${file} is a licence notice file. The bundler writes them again: compare them with the notices in ATTRIBUTIONS.md and update noticeChecks.ts.`,
  );
  for (const holder of BUNDLED_NOTICE_HOLDERS) {
    if (!attributions.includes(holder)) {
      findings.push(`ATTRIBUTIONS.md does not carry the notice "${holder}".`);
    }
  }
  if (!attributions.includes(LICENCE_TEXT_MARKER)) {
    findings.push("ATTRIBUTIONS.md does not carry the MIT licence text.");
  }
  return findings;
}
