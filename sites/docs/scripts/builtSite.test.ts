// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  brokenInternalLinks,
  externalResources,
  inlineScriptHashes,
  inlineStyleAttributes,
  scriptBytesFor,
  stripHiddenSprite,
} from "./builtSite";

const roots: string[] = [];

function site(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-site-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("inlineScriptHashes", () => {
  it("hashes each executable inline script and skips data blocks and files", () => {
    const html = `<script>var a=1</script><script src="/docs/a.js"></script>
      <script type="application/ld+json">{"x":1}</script><script type="module">import "x"</script>`;
    const hash = (text: string) =>
      `sha256-${createHash("sha256").update(text).digest("base64")}`;
    expect(inlineScriptHashes(html).sort()).toEqual(
      [hash("var a=1"), hash('import "x"')].sort(),
    );
  });
});

describe("inlineStyleAttributes", () => {
  it("finds a style attribute, which the policy would block", () => {
    expect(inlineStyleAttributes('<p style="color:red">x</p>')).toBe(1);
    expect(inlineStyleAttributes("<p>x</p><style>a{}</style>")).toBe(0);
  });
});

describe("externalResources", () => {
  it("lists scripts, styles, images and fonts fetched from another origin, not links a reader follows", () => {
    const html = `<a href="https://github.com/x">x</a>
      <script src="https://cdn.example/a.js"></script>
      <link rel="stylesheet" href="//cdn.example/a.css">
      <link rel="icon" href="/favicon.svg"><img src="https://img.example/a.png">`;
    expect(externalResources(html).sort()).toEqual([
      "//cdn.example/a.css",
      "https://cdn.example/a.js",
      "https://img.example/a.png",
    ]);
  });
});

describe("brokenInternalLinks", () => {
  const files = {
    "index.html": '<a href="/docs/guides/x/">x</a>',
    "guides/x/index.html": "<h1>x</h1>",
    "assets/a.css": "a{}",
  };

  it("passes links to pages and files under the base path", () => {
    const root = site({
      ...files,
      "page/index.html":
        '<a href="/docs/guides/x/#top">x</a><a href="/docs/assets/a.css">c</a>',
    });
    expect(brokenInternalLinks(root, "/docs/", [])).toEqual([]);
  });

  it("reports a link to a page that was not built", () => {
    const root = site({
      ...files,
      "page/index.html": '<a href="/docs/guides/missing/">m</a>',
    });
    expect(brokenInternalLinks(root, "/docs/", [])).toEqual([
      { from: "page/index.html", href: "/docs/guides/missing/" },
    ]);
  });

  it("allows a link to the reference site's own pages, and no other path outside the base", () => {
    const root = site({
      ...files,
      "page/index.html": '<a href="/map">m</a><a href="/other">o</a>',
    });
    expect(brokenInternalLinks(root, "/docs/", ["/", "/map"])).toEqual([
      { from: "page/index.html", href: "/other" },
    ]);
  });
});

describe("scriptBytesFor", () => {
  it("adds the gzip size of every script a page loads", () => {
    const a = "console.log(1);".repeat(50);
    const b = "console.log(2);".repeat(80);
    const root = site({
      "assets/js/a.js": a,
      "assets/js/b.js": b,
      "page/index.html":
        '<script src="/docs/assets/js/a.js" defer></script><link rel="modulepreload" href="/docs/assets/js/b.js">',
    });
    expect(scriptBytesFor(root, "/docs/", "page/index.html")).toBe(
      gzipSync(a).length + gzipSync(b).length,
    );
  });
});

describe("stripHiddenSprite", () => {
  it("removes the hidden sprite that carries a style attribute", () => {
    const sprite =
      '<svg style="display: none;"><defs><symbol id="a"><path d="M0 0"/></symbol></defs></svg>';
    expect(stripHiddenSprite(`<body>${sprite}<main>x</main></body>`)).toBe(
      "<body><main>x</main></body>",
    );
  });

  it("leaves a visible graphic alone", () => {
    const html = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    expect(stripHiddenSprite(html)).toBe(html);
  });
});
