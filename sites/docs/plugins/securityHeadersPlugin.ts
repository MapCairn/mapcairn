// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@docusaurus/types";
import { htmlFiles, stripHiddenSprite } from "../scripts/builtSite";
import { EXPECTED_INLINE_SCRIPTS } from "../scripts/expectedInlineScripts";
import { buildHeadersFile } from "../scripts/securityHeaders";

/**
 * Hardens a finished build for the policy. It removes the framework's hidden
 * icon sprite (a style attribute the policy would block) and writes `_headers`:
 * the reference site's security headers and a Content-Security-Policy that
 * allows exactly the inline scripts committed in `expectedInlineScripts.ts`,
 * by hash. The hashes are not read from the pages: `verifyBuild.ts` fails the
 * build on any inline script that is not on that list, so a new one cannot
 * slip into the policy unseen.
 * @param outDir - The build folder.
 */
export function writeHeaders(outDir: string): void {
  for (const page of htmlFiles(outDir)) {
    const path = join(outDir, page);
    writeFileSync(path, stripHiddenSprite(readFileSync(path, "utf8")));
  }
  writeFileSync(
    join(outDir, "_headers"),
    buildHeadersFile(EXPECTED_INLINE_SCRIPTS.map(({ hash }) => hash)),
  );
}

/** The Docusaurus plugin that runs {@link writeHeaders} after the build. */
export default function securityHeadersPlugin(): Plugin {
  return {
    name: "mapcairn-security-headers",
    postBuild({ outDir }) {
      writeHeaders(outDir);
    },
  };
}
