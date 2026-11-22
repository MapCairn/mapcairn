// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  contentTypeOf,
  decodePathname,
  insideFolder,
  type PathKind,
  resolveTarget,
  type Target,
} from "./serveBuild";

/**
 * Serves `build/` under the base path the way the documentation Worker does
 * (see `resolveTarget`), with gzip on text, for the browser checks and the
 * Lighthouse run. `docusaurus serve` is not used because it redirects a file
 * such as the font to an address with a trailing slash that answers 404.
 * It listens on the loopback address only.
 *
 * Usage: `node --import tsx scripts/serve.ts <port>`.
 */
const BUILD_FOLDER = fileURLToPath(new URL("../build", import.meta.url));
const LOOPBACK = "127.0.0.1";
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

function plain(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function send(response: ServerResponse, status: number, path: string): void {
  const absolute = join(BUILD_FOLDER, path);
  if (!insideFolder(BUILD_FOLDER, absolute)) {
    plain(response, 404, "Not found");
    return;
  }
  let body: Buffer;
  try {
    body = readFileSync(absolute);
  } catch {
    plain(response, status === 404 ? 404 : 500, "Not found");
    return;
  }
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

function pathnameOf(url: string): string | null {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return null;
  }
}

createServer((request, response) => {
  const pathname = pathnameOf(request.url ?? "/");
  const decoded = pathname === null ? null : decodePathname(pathname);
  if (decoded === null) {
    plain(response, 400, "Bad request");
    return;
  }
  respond(response, resolveTarget(decoded, kindOf));
}).listen(port, LOOPBACK, () => {
  console.log(`Serving ${BUILD_FOLDER} on ${LOOPBACK}:${port}`);
});
