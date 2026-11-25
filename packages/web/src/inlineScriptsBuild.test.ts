// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequestHandler, type ServerBuild } from "react-router";
import { describe, expect, it } from "vitest";
import { workerBundleRoot } from "./workerBundleRoot";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = workerBundleRoot(webRoot);
const chunkDirectory = bundleRoot ? join(bundleRoot, "assets/js") : "";

/**
 * The pages to render and how many inline scripts, outside the router's
 * nonced ones, each is expected to carry: the theme bootstrap on every page,
 * and the old-map-link redirect and the copy buttons' script on the product
 * page only. A page that loses one fails on the count, not only on a hash. The
 * last field says whether the page carries the router's nonced scripts: the
 * product page runs no framework script, so it carries none.
 */
const PAGES: readonly (readonly [
  path: string,
  inlineScripts: number,
  nonced: boolean,
])[] = [
  ["/", 3, false],
  ["/map", 1, true],
  ["/privacy", 1, true],
  ["/no-such-page", 1, true],
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
  return [
    ...html.matchAll(/<script(?=[\s/>])([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi),
  ].map(([, attributes, body]) => ({
    attributes: attributes ?? "",
    body: body ?? "",
  }));
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

/** The keywords that let script run that a nonce or hash would not. */
const UNSAFE_KEYWORDS: readonly string[] = [
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'unsafe-hashes'",
];

/** The directives that govern scripts; `default-src` counts only without `script-src`. */
const SCRIPT_DIRECTIVES: readonly string[] = [
  "script-src",
  "script-src-elem",
  "script-src-attr",
];

/**
 * Each unsafe keyword a policy gives script, as `<directive> allows <keyword>`:
 * in `script-src`, `script-src-elem` and `script-src-attr`, and in
 * `default-src` when the policy has no `script-src` for it to stand in for.
 * Directive names and keywords are read in any letter case.
 */
function unsafeSources(policy: string): string[] {
  const directives = policy
    .split(";")
    .map((directive) => directive.trim().toLowerCase().split(/\s+/))
    .filter(([name]) => name !== undefined && name !== "");
  const named = (name: string) => directives.filter(([n]) => n === name);
  const governing = [
    ...SCRIPT_DIRECTIVES,
    ...(named("script-src").length === 0 ? ["default-src"] : []),
  ];
  return governing.flatMap((name) =>
    named(name).flatMap(([, ...sources]) =>
      UNSAFE_KEYWORDS.filter((keyword) => sources.includes(keyword)).map(
        (keyword) => `${name} allows ${keyword}`,
      ),
    ),
  );
}

/** Whether no script on the page carries a nonce, which a page that uses one must not do. */
function missingNonce(html: string): string[] {
  return nonces(html).length === 0 ? ["no script carries a nonce"] : [];
}

/** The nonces the page's scripts carry. */
function nonces(html: string): string[] {
  return scripts(html)
    .map(({ attributes }) => attribute(attributes, "nonce"))
    .filter((nonce): nonce is string => nonce !== undefined);
}

/** The nonces two renders of one page share; a fresh nonce per response leaves none. */
function reusedNonces(first: string, second: string): string[] {
  const earlier = new Set(nonces(first));
  return nonces(second).filter((nonce) => earlier.has(nonce));
}

/**
 * Everything wrong with a page and the policy it was sent with, so each check
 * fails closed: a `<script` the reader above did not match (counted with a
 * plain case-insensitive search, not parsed), an unsafe keyword in a script
 * directive ({@link unsafeSources}), and whatever {@link violations} reports.
 *
 * The count also raises a false alarm on a literal `<script` inside an inline
 * script's body, which is why it is a count and not a parse: a future alarm
 * from that is understood, not hidden. It does not cover markup that runs
 * script without a `<script` tag (`on*=` attributes, `javascript:` URLs,
 * `srcdoc`); the page's policy blocks those, and this test reads only
 * `<script` elements.
 */
function problems(html: string, policy: string): string[] {
  const found = (html.match(/<script/gi) ?? []).length;
  const read = scripts(html).length;
  const unreadable =
    found === read ? [] : [`${found} \`<script\` found, ${read} read`];
  return [...unreadable, ...unsafeSources(policy), ...violations(html, policy)];
}

/** Set to `1` by the CI step that runs after the build, so a missing output fails. */
const REQUIRE_BUILD_OUTPUT = "MAPCAIRN_REQUIRE_BUILD_OUTPUT";

/** Whether the build-output tests skip: the output is missing and not required. */
function skipsWithoutBuild(
  missing: boolean,
  required: string | undefined,
): boolean {
  return missing && required !== "1";
}

describe("skipsWithoutBuild", () => {
  it("skips when the output is missing and not required", () => {
    expect(skipsWithoutBuild(true, undefined)).toBe(true);
    expect(skipsWithoutBuild(true, "")).toBe(true);
  });

  it("does not skip when the output is missing and required, so the tests fail", () => {
    expect(skipsWithoutBuild(true, "1")).toBe(false);
  });

  it("does not skip when the output exists", () => {
    expect(skipsWithoutBuild(false, undefined)).toBe(false);
    expect(skipsWithoutBuild(false, "1")).toBe(false);
  });
});

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

  it("reads scripts whose start or end tag is upper case or carries extra text", () => {
    expect(violations("<SCRIPT>a</SCRIPT >", policy)).toEqual([cspHash("a")]);
    expect(violations('<script>b</script foo="bar">', policy)).toEqual([
      cspHash("b"),
    ]);
    expect(violations("<script>c</script\t\n bar>", policy)).toEqual([
      cspHash("c"),
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

describe("problems", () => {
  const script = "(function(){})()";
  const policy = `default-src 'self'; script-src 'self' ${cspHash(script)} 'nonce-abc'; style-src 'self'`;

  it("accepts a page whose scripts all parse and a policy without unsafe-inline", () => {
    const html = `<script>${script}</script><script nonce="abc">x</script>`;
    expect(problems(html, policy)).toEqual([]);
  });

  it("fails on a script the reader cannot parse, so it is not silently ignored", () => {
    const unterminated = `<script>${script}</script><script>never closed`;
    expect(problems(unterminated, policy)).toEqual([
      "2 `<script` found, 1 read",
    ]);
    const glued = `<script>${script}</script><scripty>z</scripty><script/>`;
    expect(problems(glued, policy)).toHaveLength(1);
  });

  it("fails on unsafe-inline in script-src, in any letter case", () => {
    const html = `<script>${script}</script>`;
    expect(
      problems(html, `script-src 'self' 'unsafe-inline' ${cspHash(script)}`),
    ).toEqual(["script-src allows 'unsafe-inline'"]);
    expect(problems(html, "script-src 'UNSAFE-INLINE'")).toContain(
      "script-src allows 'unsafe-inline'",
    );
  });

  it("does not mind unsafe-inline outside script-src", () => {
    expect(
      problems(
        `<script>${script}</script>`,
        `${policy}; img-src 'unsafe-inline'`,
      ),
    ).toEqual([]);
  });

  it("includes what the policy would refuse", () => {
    expect(problems("<script>q</script>", policy)).toEqual([cspHash("q")]);
  });
});

describe("unsafeSources", () => {
  it("is empty for a policy with none of them", () => {
    expect(
      unsafeSources("default-src 'self'; script-src 'self' 'nonce-a'"),
    ).toEqual([]);
  });

  it.each(["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'"])(
    "reports %s in each script directive",
    (keyword) => {
      for (const name of ["script-src", "script-src-elem", "script-src-attr"]) {
        expect(unsafeSources(`${name} 'self' ${keyword}`)).toEqual([
          `${name} allows ${keyword}`,
        ]);
      }
    },
  );

  it("reads directive names and keywords in any letter case", () => {
    expect(unsafeSources("Script-Src 'self' 'Unsafe-Eval'")).toEqual([
      "script-src allows 'unsafe-eval'",
    ]);
  });

  it("reads default-src only when there is no script-src", () => {
    expect(unsafeSources("default-src 'unsafe-inline'")).toEqual([
      "default-src allows 'unsafe-inline'",
    ]);
    expect(
      unsafeSources("default-src 'unsafe-inline'; script-src 'self'"),
    ).toEqual([]);
  });

  it("ignores the keywords in other directives", () => {
    expect(
      unsafeSources("style-src 'unsafe-inline'; script-src 'self'"),
    ).toEqual([]);
  });
});

describe("missingNonce", () => {
  it("reports a page whose scripts carry no nonce", () => {
    expect(missingNonce("<script>x</script>")).toEqual([
      "no script carries a nonce",
    ]);
    expect(missingNonce("")).toHaveLength(1);
  });

  it("accepts a page with a nonce on a script", () => {
    expect(missingNonce('<script nonce="a">x</script>')).toEqual([]);
  });
});

describe("reusedNonces", () => {
  it("is empty when two renders carry different nonces", () => {
    expect(
      reusedNonces(
        '<script nonce="a">x</script>',
        '<script nonce="b">x</script>',
      ),
    ).toEqual([]);
  });

  it("reports a nonce both renders carry, as a fixed nonce would", () => {
    expect(
      reusedNonces(
        '<script nonce="a">x</script>',
        '<script nonce="a">y</script>',
      ),
    ).toEqual(["a"]);
  });

  it("reports a nonce that stays the same in only one script", () => {
    expect(
      reusedNonces(
        '<script nonce="a">x</script><script nonce="b">x</script>',
        '<script nonce="c">x</script><script nonce="b">x</script>',
      ),
    ).toEqual(["b"]);
  });
});

/**
 * Renders the built server bundle in Node and checks the policy it sends
 * against the scripts it renders. The theme script is made at run time from
 * `Function.toString()` of core functions, so the bundler decides its text (it
 * may rename a function to `resolveTheme$1`); only the built bundle shows the
 * text the browser receives (issue #479). Skipped where there is no build
 * output (a plain `npm test`, or the coverage run, which comes before the
 * build), unless `MAPCAIRN_REQUIRE_BUILD_OUTPUT=1` is set, as the CI step after the
 * build does: there a missing output means the path moved, and the test fails.
 */
const buildMissing = !existsSync(chunkDirectory);

describe.skipIf(
  skipsWithoutBuild(buildMissing, process.env[REQUIRE_BUILD_OUTPUT]),
)(
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

    it("gives script no unsafe keyword in the public/_headers policy", () => {
      expect(unsafeSources(headersPolicy)).toEqual([]);
    });

    it.each(PAGES)(
      "%s: carries %i hashed inline script(s), each allowed by the policy it is sent with and by public/_headers, a fresh nonce per render and no unsafe-inline",
      async (page, count, nonced) => {
        const response = await render(page);
        const policy = response.headers.get("content-security-policy") ?? "";
        const html = await response.text();
        const again = await (await render(page)).text();
        expect(hashedScripts(html)).toHaveLength(count);
        expect(problems(html, policy)).toEqual([]);
        expect(missingNonce(html)).toEqual(
          nonced ? [] : ["no script carries a nonce"],
        );
        expect(reusedNonces(html, again)).toEqual([]);
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
