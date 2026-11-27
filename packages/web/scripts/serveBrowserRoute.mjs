// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Serves the pages the browser-route checks drive (`e2e/browser-route/pages`)
 * and, under `/mapcairn/`, the files an adopter serves: the bundle that
 * `examples/browser/copyFiles.mjs` copies out of the built `@mapcairn/sdk`.
 *
 *   node scripts/serveBrowserRoute.mjs [port]
 *
 * The port is the argument, then `MAPCAIRN_BROWSER_E2E_PORT`, then 4892.
 * `playwright.config.ts` reads the same variable. Run `npm run build:sdk`
 * first, as `test:e2e` and `a11y` do. The server listens on 127.0.0.1 only and
 * sends no Content-Security-Policy: the consumer check serves the same files
 * under the strict policy, and these checks are about the interface.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentTypeOf,
  staticFile,
} from "../../../scripts/release/browserLeg.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(HERE, "../../../examples/browser");
const PAGES = path.resolve(HERE, "../e2e/browser-route/pages");
const FILES_PREFIX = "/mapcairn";
const DEFAULT_PORT = "4892";

const port =
  process.argv[2] ?? process.env.MAPCAIRN_BROWSER_E2E_PORT ?? DEFAULT_PORT;
if (!/^\d+$/.test(port)) {
  console.error(`The port must be a number, got "${port}".`);
  process.exit(1);
}

const copied = spawnSync(process.execPath, ["copyFiles.mjs"], {
  cwd: EXAMPLE,
  stdio: "inherit",
});
if (copied.status !== 0) {
  process.exit(copied.status ?? 1);
}

/** The file a request path names: the bundle's under `/mapcairn/`, a page's otherwise. */
function fileFor(requestPath) {
  if (requestPath.startsWith(`${FILES_PREFIX}/`)) {
    return staticFile(
      path.join(EXAMPLE, "mapcairn"),
      requestPath.slice(FILES_PREFIX.length),
    );
  }
  return staticFile(PAGES, requestPath);
}

const server = createServer(async (request, response) => {
  const file = fileFor(request.url ?? "/");
  try {
    if (file === undefined) {
      throw new Error("outside the folders served");
    }
    const body = await readFile(file);
    response.writeHead(200, { "content-type": contentTypeOf(file) });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(Number(port), "127.0.0.1");
