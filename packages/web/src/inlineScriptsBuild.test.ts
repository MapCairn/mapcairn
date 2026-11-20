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

/**
 * The pages to render and how many inline scripts, outside the router's
 * nonced ones, each is expected to carry: the theme bootstrap on every page,
 * and the old-map-link redirect on the product page only. A page that loses
 * one fails on the count, not only on a hash.
 */
const PAGES: readonly (readonly [path: string, inlineScripts: number])[] = [
  ["/", 2],
  ["/map", 1],
  ["/privacy", 1],
  ["/no-such-page", 1],
];

/** Script types a browser never runs, so no policy source applies to them. */
const DATA_TYPES: ReadonlySet<string> = new Set([
  "application/ld+json",
  "application/json",
]);

/** The CSP source for an inline script: `'sha256-<base64 digest>'`. */
function cspHash(script: string): string {
  const digest = createHash("sha256").update(script, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

/** The value of one attribute in a tag's attribute text, or undefined. */
function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}(?:=(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=\\s|$)`,
  ).exec(attributes);
  if (match === null) {
    return undefined;
  }
  return match[1] ?? match[2] ?? match[3] ?? "";
}

/** The `<script>` elements of a page: their attribute text and body. */
function scripts(html: string): { attributes: string; body: string }[] {
  return [...html.matchAll(/<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g)].map(
    ([, attributes, body]) => ({
      attributes: attributes ?? "",
      body: body ?? "",
    }),
  );
}

/**
 * The scripts that run without a source and without a nonce, which only a
 * hash can allow. A data block is left out; a script with a nonce is judged by
 * {@link violations} instead.
 */
function hashedScripts(html: string): string[] {
  return scripts(html)
    .filter(({ attributes }) => {
      const type = attribute(attributes, "type");
      return (
        attribute(attributes, "src") === undefined &&
        attribute(attributes, "nonce") === undefined &&
        !(type !== undefined && DATA_TYPES.has(type))
      );
    })
    .map(({ body }) => body);
}

/** The `script-src` directive of a policy. */
function scriptSources(policy: string): string {
  return (
    policy
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith("script-src ")) ?? ""
  );
}

/**
 * What a policy would refuse in a page: each script that runs without a source
 * or nonce and whose hash `script-src` lacks, as that hash, and each nonce the
 * policy does not carry.
 */
function violations(html: string, policy: string): string[] {
  const sources = scriptSources(policy);
  const unhashed = hashedScripts(html)
    .map(cspHash)
    .filter((hash) => !sources.includes(hash));
  const wrongNonces = scripts(html)
    .map(({ attributes }) => attribute(attributes, "nonce"))
    .filter(
      (nonce): nonce is string =>
        nonce !== undefined && !sources.includes(`'nonce-${nonce}'`),
    )
    .map((nonce) => `nonce-${nonce}`);
  return [...unhashed, ...wrongNonces];
}

describe("violations", () => {
  const script = "(function(){})()";
  const policy = `default-src 'self'; script-src 'self' ${cspHash(script)} 'nonce-abc'; style-src 'self'`;

  it("accepts an inline script whose hash the policy lists, and a nonce it carries", () => {
    const html = `<script>${script}</script><script nonce="abc">x</script>`;
    expect(violations(html, policy)).toEqual([]);
  });

  it("reports an inline script whose text differs from the one hashed", () => {
    const changed = "(function resolveTheme$1(){})()";
    expect(violations(`<script>${changed}</script>`, policy)).toEqual([
      cspHash(changed),
    ]);
  });

  it("reports an unhashed inline module script, or one with a text/javascript type", () => {
    expect(
      violations('<script type="module">import "/x"</script>', policy),
    ).toEqual([cspHash('import "/x"')]);
    expect(
      violations('<script type="text/javascript">y</script>', policy),
    ).toEqual([cspHash("y")]);
  });

  it("reports a nonce the policy does not carry", () => {
    expect(violations('<script nonce="other">x</script>', policy)).toEqual([
      "nonce-other",
    ]);
  });

  it("is not fooled by a data- attribute named like a real one", () => {
    expect(violations('<script data-src="/a.js">z</script>', policy)).toEqual([
      cspHash("z"),
    ]);
  });

  it("skips scripts with a source and data blocks", () => {
    const html =
      '<script src="/a.js"></script><script type="application/ld+json">{}</script><script type="application/json">{}</script>';
    expect(violations(html, policy)).toEqual([]);
  });

  it("reads only the script-src directive", () => {
    expect(scriptSources(policy)).toContain("'nonce-abc'");
    expect(scriptSources(policy)).not.toContain("style-src");
  });
});

/**
 * Renders the built server bundle in Node and checks the policy it sends
 * against the scripts it renders. The theme script is made at run time from
 * `Function.toString()` of core functions, so the bundler decides its text (it
 * may rename a function to `resolveTheme$1`); only the built bundle shows the
 * text the browser receives (issue #479). Skipped where there is no build
 * output (a plain `npm test` on a fresh checkout), but not in CI, where the
 * step runs after the build and a missing output means the path moved.
 */
const buildMissing = !existsSync(chunkDirectory);

describe.skipIf(buildMissing && !process.env.CI)(
  "the inline scripts in the built server bundle (needs `npm run build`)",
  () => {
    const headersFile = readFileSync(join(webRoot, "public/_headers"), "utf8");
    const headersPolicy =
      /^\s*Content-Security-Policy:\s*(.+)$/m.exec(headersFile)?.[1] ?? "";

    async function render(page: string): Promise<Response> {
      const chunk = readdirSync(chunkDirectory).find((name) =>
        /^server-build-.*\.js$/.test(name),
      );
      expect(chunk, "the built server chunk").toBeDefined();
      const url = pathToFileURL(join(chunkDirectory, chunk ?? "")).href;
      const build = (await import(/* @vite-ignore */ url)) as ServerBuild;
      return createRequestHandler(
        build,
        "production",
      )(new Request(`http://localhost${page}`));
    }

    it("has the build output", () => {
      expect(buildMissing).toBe(false);
    });

    it("has a Content-Security-Policy in public/_headers with a script-src", () => {
      expect(scriptSources(headersPolicy)).toContain("'self'");
    });

    it.each(PAGES)(
      "%s: carries %i hashed inline script(s), each allowed by the policy it is sent with and by public/_headers",
      async (page, count) => {
        const response = await render(page);
        const policy = response.headers.get("content-security-policy") ?? "";
        const html = await response.text();
        expect(hashedScripts(html)).toHaveLength(count);
        expect(violations(html, policy)).toEqual([]);
        expect(
          hashedScripts(html)
            .map(cspHash)
            .filter((hash) => !scriptSources(headersPolicy).includes(hash)),
        ).toEqual([]);
      },
      30_000,
    );
  },
);
