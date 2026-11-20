// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequestHandler, type ServerBuild } from "react-router";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const chunkDirectory = join(
  webRoot,
  ".cloudflare/output/v0/workers/default/bundle/assets/js",
);

/** The pages that carry an inline script: the product page and the map. */
const PAGES = ["/", "/map"] as const;

/** The CSP source for an inline script: `'sha256-<base64 digest>'`. */
function cspHash(script: string): string {
  const digest = createHash("sha256").update(script, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

/**
 * The bodies of the inline scripts the browser would run from a page: no
 * `src`, no nonce (the nonce covers the router's own scripts) and not a data
 * block such as JSON-LD, which a browser never executes.
 */
function inlineScripts(html: string): string[] {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  return scripts
    .filter(([, attributes]) => !/\b(src|nonce|type)=/.test(attributes ?? ""))
    .map(([, , body]) => body ?? "");
}

/**
 * The inline scripts of a page that its policy does not allow by hash, as the
 * hash a browser would compute for each.
 */
function unallowedHashes(html: string, policy: string): string[] {
  return inlineScripts(html)
    .map(cspHash)
    .filter((hash) => !policy.includes(hash));
}

describe("unallowedHashes", () => {
  const script = "(function(){})()";
  const policy = `script-src 'self' ${cspHash(script)}`;

  it("accepts an inline script whose hash the policy lists", () => {
    expect(unallowedHashes(`<script>${script}</script>`, policy)).toEqual([]);
  });

  it("reports an inline script whose text differs from the one hashed", () => {
    const changed = "(function resolveTheme$1(){})()";
    expect(unallowedHashes(`<script>${changed}</script>`, policy)).toEqual([
      cspHash(changed),
    ]);
  });

  it("skips scripts with a source, a nonce or a data type", () => {
    const html =
      '<script src="/a.js"></script><script nonce="n">x</script><script type="application/ld+json">{}</script>';
    expect(unallowedHashes(html, policy)).toEqual([]);
  });
});

/**
 * Renders the built server bundle in Node and checks the policy it sends
 * against the scripts it renders. The theme script is made at run time from
 * `Function.toString()` of core functions, so the bundler decides its text (it
 * may rename a function to `resolveTheme$1`); only the built bundle shows the
 * text the browser receives (issue #479). Skipped where there is no build
 * output (a plain `npm test` on a fresh checkout).
 */
describe.skipIf(!existsSync(chunkDirectory))(
  "the inline scripts in the built server bundle (needs `npm run build`)",
  () => {
    const headersFile = readFileSync(join(webRoot, "public/_headers"), "utf8");

    async function render(page: string): Promise<Response> {
      const chunk = readdirSync(chunkDirectory).find((name) =>
        /^server-build-.*\.js$/.test(name),
      );
      expect(chunk).toBeDefined();
      const url = pathToFileURL(join(chunkDirectory, chunk ?? "")).href;
      const build = (await import(/* @vite-ignore */ url)) as ServerBuild;
      return createRequestHandler(
        build,
        "production",
      )(new Request(`http://localhost${page}`));
    }

    it.each(PAGES)(
      "%s: every inline script is allowed by hash in the policy it is sent with and in public/_headers",
      async (page) => {
        const response = await render(page);
        const policy = response.headers.get("content-security-policy") ?? "";
        const html = await response.text();
        expect(inlineScripts(html).length).toBeGreaterThan(0);
        expect(unallowedHashes(html, policy)).toEqual([]);
        expect(unallowedHashes(html, headersFile)).toEqual([]);
      },
      30_000,
    );
  },
);
