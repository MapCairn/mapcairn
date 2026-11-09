import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import headersFile from "../public/_headers?raw";

/** Isolates one path block (path line plus its indented headers) from `_headers`. */
function getBlock(path: string): string {
  return (
    headersFile.split("\n\n").find((block) => block.startsWith(`${path}\n`)) ??
    ""
  );
}

/** Reads a single header's value out of a block returned by `getBlock`. */
function getHeader(block: string, name: string): string | undefined {
  const line = block.split("\n").find((l) => l.trim().startsWith(`${name}:`));
  return line?.trim().slice(`${name}:`.length).trim();
}

describe("public/_headers", () => {
  it("allows location search to reach Nominatim under the CSP connect-src directive", () => {
    const csp = getHeader(getBlock("/*"), "Content-Security-Policy") ?? "";
    const connectSrc = csp.match(/connect-src ([^;]+)/)?.[1] ?? "";

    expect(connectSrc).toContain("https://nominatim.openstreetmap.org");
  });

  it("allows routing to reach the Valhalla server under the CSP connect-src directive", () => {
    const csp = getHeader(getBlock("/*"), "Content-Security-Policy") ?? "";
    const connectSrc = csp.match(/connect-src ([^;]+)/)?.[1] ?? "";

    expect(connectSrc).toContain("https://valhalla1.openstreetmap.de");
  });

  it("sets a Strict-Transport-Security header on every response", () => {
    expect(getBlock("/*")).toMatch(/Strict-Transport-Security:\s*max-age=\d+/);
  });

  it("has no dataset-specific cache configuration", () => {
    expect(getBlock("/data/*")).toBe("");
  });
});

/** One `_headers` rule: a URL pattern and its `Name: value` lines. */
interface HeaderRule {
  readonly pattern: string;
  readonly headers: readonly (readonly [string, string])[];
}

/** Parses every rule in `_headers`, in file order. */
function parseRules(file: string): HeaderRule[] {
  const rules: { pattern: string; headers: [string, string][] }[] = [];
  for (const line of file.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    if (!line.startsWith(" ")) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const separator = line.indexOf(":");
    rules
      .at(-1)
      ?.headers.push([
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ]);
  }
  return rules;
}

/**
 * Whether a `_headers` pattern matches a path. A `*` is a greedy splat that
 * may cross `/`, as Cloudflare's static assets treat it; nothing else is
 * special in the patterns this file uses.
 */
function matches(pattern: string, path: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`).test(path);
}

/** Every `Cache-Control` value the rules give a path. Cloudflare joins several with a comma. */
function cacheControlFor(path: string): string[] {
  return parseRules(headersFile)
    .filter((rule) => matches(rule.pattern, path))
    .flatMap((rule) =>
      rule.headers
        .filter(([name]) => name.toLowerCase() === "cache-control")
        .map(([, value]) => value),
    );
}

/** Every file in `public/` as the URL path it is served at. */
function publicPaths(): string[] {
  const root = path.join(__dirname, "../public");
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      `/${path.relative(root, path.join(entry.parentPath, entry.name))}`.replaceAll(
        "\\",
        "/",
      ),
    )
    .filter((served) => served !== "/_headers");
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const A_WEEK = "public, max-age=604800, stale-while-revalidate=86400";
const A_DAY = "public, max-age=86400";

/** Text files that change by hand and should reach people within a day. */
const DAILY = new Set(["/site.webmanifest", "/.well-known/security.txt"]);

describe("public/_headers cache rules", () => {
  it("keeps hashed build assets for a year", () => {
    for (const asset of [
      "/assets/entry.client-abc123.js",
      "/assets/css/root-abc123.css",
      "/assets/fonts/ibm-plex-sans-latin-wght-normal-abc123.woff2",
    ]) {
      expect(cacheControlFor(asset), asset).toEqual([IMMUTABLE]);
    }
  });

  it("gives every static file exactly one cache rule: a week for images and icons, a day for the manifest and security.txt", () => {
    const paths = publicPaths();
    expect(paths).toContain("/basemaps/liberty.jpg");
    expect(paths).toContain("/favicon.svg");
    for (const served of paths) {
      const expected = DAILY.has(served) ? [A_DAY] : [A_WEEK];
      expect(cacheControlFor(served), served).toEqual(expected);
    }
  });

  it("has no rule for a page the server renders, which sets its own", () => {
    expect(getBlock("/index.html")).toBe("");
    expect(cacheControlFor("/")).toEqual([]);
    expect(cacheControlFor("/privacy")).toEqual([]);
  });
});
