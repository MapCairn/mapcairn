// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/// <reference types="node" />
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Where `cf build` writes the Worker, under a folder named for the Build Output version. */
const OUTPUT = ".cloudflare/output";

/** The Worker's bundle inside one Build Output version folder. */
const BUNDLE = "workers/default/bundle";

/**
 * The Worker bundle `cf build` wrote under `webRoot`, found by name because the
 * Build Output version folder (`v0`, `v1`) changes between `cf` releases, or
 * undefined where there is no build output.
 */
export function workerBundleRoot(webRoot: string): string | undefined {
  const output = join(webRoot, OUTPUT);
  if (!existsSync(output)) {
    return undefined;
  }
  return readdirSync(output)
    .map((version) => join(output, version, BUNDLE))
    .find((bundle) => existsSync(bundle));
}
