// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Runs one built Worker module on workerd, the runtime the published host
 * uses, and prints what a request to it returns. The consumer check runs this
 * in a child process, so a failure cannot leave a workerd behind: the process
 * disposes of its Miniflare either way, and workerd exits with its parent.
 *
 *   node scripts/release/workerdRun.mjs <path to the built Worker module>
 *
 * Miniflare is a root devDependency, pinned exactly (it is a prerelease), so
 * this script does not rely on the Cloudflare Vite plugin's copy being
 * hoisted. It listens on 127.0.0.1
 * only (set explicitly below), on a port the system picks, for one request.
 */
import path from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { isEntryPoint } from "../entryPoint.mjs";

/**
 * The compatibility date the Worker runs with: the reference host's. No
 * compatibility flag is set, so the SDK is shown to need nothing beyond the
 * plain Workers runtime (no `nodejs_compat`).
 */
export const COMPATIBILITY_DATE = "2026-09-08";

/** How long the one request may take before it is aborted, in ms. */
const REQUEST_TIMEOUT = 60 * 1000;

/**
 * Serves the module on workerd, requests the page once and stops workerd.
 *
 * @param {string} modulePath The built Worker module.
 * @returns {Promise<string>} The response body.
 */
export async function requestOnWorkerd(modulePath) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: path.resolve(modulePath),
      modulesRoot: path.dirname(path.resolve(modulePath)),
      compatibilityDate: COMPATIBILITY_DATE,
      host: "127.0.0.1",
    }),
  );
  const stop = () => {
    void mf.dispose().finally(() => process.exit(1));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const response = await mf.dispatchFetch("http://localhost/", {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) {
      throw new Error(
        `The Worker answered ${response.status}:\n${await response.text()}`,
      );
    }
    return await response.text();
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await mf.dispose();
  }
}

if (isEntryPoint(import.meta.url)) {
  try {
    process.stdout.write(await requestOnWorkerd(process.argv[2] ?? ""));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
