// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  contentTypeOf,
  type PathKind,
  resolveTarget,
  type Target,
} from "./serveBuild";

/**
 * Serves `build/` under the base path the way the documentation Worker does
 * (see `resolveTarget`), with gzip on text, for the browser checks and the
 * Lighthouse run. `docusaurus serve` is not used because it redirects a file
 * such as the font to an address with a trailing slash that answers 404.
 *
 * Usage: `node --import tsx scripts/serve.ts <port>`.
 */
const BUILD_FOLDER = fileURLToPath(new URL("../build", import.meta.url));
const port = Number(process.argv[2]);

function kindOf(relativePath: string): PathKind {
  try {
    return statSync(join(BUILD_FOLDER, relativePath)).isDirectory()
      ? "directory"
      : "file";
  } catch {
    return "none";
  }
}

function send(response: ServerResponse, status: number, path: string): void {
  const body = readFileSync(join(BUILD_FOLDER, path));
  const type = contentTypeOf(path);
  const compress = /^(text|application\/(json|xml))|svg/.test(type);
  response.writeHead(status, {
    "Content-Type": type,
    ...(compress ? { "Content-Encoding": "gzip" } : {}),
  });
  response.end(compress ? gzipSync(body) : body);
}

function respond(response: ServerResponse, target: Target): void {
  if (target.kind === "redirect") {
    response.writeHead(301, { Location: target.location });
    response.end();
    return;
  }
  send(response, target.kind === "file" ? 200 : 404, target.path);
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  respond(response, resolveTarget(decodeURIComponent(pathname), kindOf));
}).listen(port, () => {
  console.log(`Serving ${BUILD_FOLDER} on port ${port}`);
});
