// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@docusaurus/types";
import {
  htmlFiles,
  inlineScriptHashes,
  stripHiddenSprite,
} from "../scripts/builtSite";
import { buildHeadersFile } from "../scripts/securityHeaders";

/**
 * Hardens a finished build for the policy. It removes the framework's hidden
 * icon sprite (a style attribute the policy would block) and writes `_headers`:
 * the reference site's security headers, and a Content-Security-Policy that allows exactly the inline
 * scripts the built pages carry, by hash. The hashes are read from the pages,
 * so the policy follows the framework's own inline scripts when it changes.
 * @param outDir - The build folder.
 */
export function writeHeaders(outDir: string): void {
  const hashes = new Set<string>();
  for (const page of htmlFiles(outDir)) {
    const path = join(outDir, page);
    const html = stripHiddenSprite(readFileSync(path, "utf8"));
    writeFileSync(path, html);
    for (const hash of inlineScriptHashes(html)) {
      hashes.add(hash);
    }
  }
  writeFileSync(join(outDir, "_headers"), buildHeadersFile([...hashes].sort()));
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
