// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OPEN_FREE_MAP_ORIGIN,
  openFreeMapResponse,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/openFreeMapFixtures.mjs";
import {
  policyWithout,
  QUICKSTART_REFUSALS,
  quickstartProblems,
  readmeQuickstart,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/quickstartLeg.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const README = readFileSync(path.join(REPO, "README.md"), "utf8");

interface Response {
  readonly contentType: string;
  readonly body: Buffer | string;
}

/** The policy the README gives, for the tests that change it. */
const POLICY = readmeQuickstart(README).policy as string;

describe("readmeQuickstart", () => {
  const quickstart = readmeQuickstart(README);

  it("takes the page, its style sheet, the entry file and the policy line from the README", () => {
    expect(quickstart.html).toContain('src="/src/main.tsx"');
    expect(quickstart.css).toContain("#root");
    expect(quickstart.tsx.startsWith("/// <reference types=")).toBe(true);
    expect(quickstart.tsx).toContain("createMapLibreMapAdapter");
    expect(quickstart.policy).toContain("default-src 'self'");
    expect(quickstart.policy).toContain(OPEN_FREE_MAP_ORIGIN);
  });

  it("fails on a README without the blocks, so a reworded README cannot pass by running nothing", () => {
    expect(() => readmeQuickstart("# Nothing here\n")).toThrow(/README/);
  });
});

describe("openFreeMapResponse", () => {
  const style = openFreeMapResponse(
    `${OPEN_FREE_MAP_ORIGIN}/styles/bright`,
  ) as Response;

  it("serves the default basemap's real style document, whose hosts are all the one origin", () => {
    const parsed = JSON.parse(String(style.body));
    expect(parsed.layers.length).toBeGreaterThan(50);
    const urls = [
      parsed.sprite,
      parsed.glyphs,
      ...Object.values<{ url?: string }>(parsed.sources).map(
        ({ url }) => url ?? OPEN_FREE_MAP_ORIGIN,
      ),
    ];
    for (const url of urls) {
      expect(new URL(url as string).origin).toBe(OPEN_FREE_MAP_ORIGIN);
    }
  });

  it("serves the tile set, the tiles, the sprite and the glyphs the style asks for", () => {
    const parsed = JSON.parse(String(style.body));
    const tileJson = openFreeMapResponse(parsed.sources.openmaptiles.url);
    const [tilePattern] = JSON.parse(String(tileJson?.body)).tiles;
    const tile = openFreeMapResponse(
      tilePattern.replace("{z}", "11").replace("{x}", "1").replace("{y}", "2"),
    ) as Response;
    expect(Buffer.from(tile.body).toString("latin1")).toContain("place");
    expect(
      JSON.parse(String(openFreeMapResponse(`${parsed.sprite}.json`)?.body)),
    ).toEqual({});
    expect(openFreeMapResponse(`${parsed.sprite}.png`)?.contentType).toBe(
      "image/png",
    );
    const glyphs = parsed.glyphs
      .replace("{fontstack}", "Noto Sans Regular")
      .replace("{range}", "0-255");
    expect(openFreeMapResponse(glyphs)?.contentType).toBe(
      "application/x-protobuf",
    );
  });

  it("answers nothing for a path the style does not name, or for another origin", () => {
    expect(
      openFreeMapResponse(`${OPEN_FREE_MAP_ORIGIN}/something-else`),
    ).toBeUndefined();
    expect(openFreeMapResponse("https://example.org/styles/bright")).toBe(
      undefined,
    );
  });
});

describe("policyWithout", () => {
  it("takes the origin out of one directive and leaves the rest", () => {
    const changed = policyWithout(
      POLICY,
      "connect-src",
      OPEN_FREE_MAP_ORIGIN,
    ) as string;
    const directives = changed.split("; ");
    expect(directives).toContain("connect-src 'self'");
    expect(directives).toContain(
      `img-src 'self' data: blob: ${OPEN_FREE_MAP_ORIGIN}`,
    );
  });

  it("takes a whole source out, such as the worker's, by naming it", () => {
    expect(policyWithout(POLICY, "worker-src", "'self'")).toContain(
      "worker-src blob:",
    );
  });

  it("throws when the directive or the source is not in the policy, so a mutation cannot be a no-op", () => {
    expect(() => policyWithout(POLICY, "media-src", "'self'")).toThrow(
      /media-src/,
    );
    expect(() =>
      policyWithout(POLICY, "font-src", "https://x.example"),
    ).toThrow(/https:\/\/x.example/);
  });

  it("names the two mutations the leg runs, each a directive the README line has", () => {
    expect(QUICKSTART_REFUSALS.length).toBe(2);
    for (const { directive, source } of QUICKSTART_REFUSALS as {
      directive: string;
      source: string;
    }[]) {
      expect(() => policyWithout(POLICY, directive, source)).not.toThrow();
    }
  });
});

describe("quickstartProblems", () => {
  const origin = "http://127.0.0.1:4196";
  const ok = {
    origin,
    requests: [
      `${origin}/`,
      `${OPEN_FREE_MAP_ORIGIN}/styles/bright`,
      `${OPEN_FREE_MAP_ORIGIN}/planet`,
      `${OPEN_FREE_MAP_ORIGIN}/planet/v1/11/1/2.pbf`,
      `${OPEN_FREE_MAP_ORIGIN}/sprites/s/ofm.json`,
      `${OPEN_FREE_MAP_ORIGIN}/sprites/s/ofm.png`,
      `${OPEN_FREE_MAP_ORIGIN}/fonts/Noto%20Sans%20Regular/0-255.pbf`,
    ],
    violations: [],
    consoleErrors: [],
    pageErrors: [],
  };

  it("has none when the style, tile set, tile, sprite and glyphs were all fetched and nothing was refused", () => {
    expect(quickstartProblems(ok)).toEqual([]);
  });

  it("names each kind of request the page never made, so a leg that drew nothing fails", () => {
    const problems = quickstartProblems({
      ...ok,
      requests: [`${origin}/`],
    }) as string[];
    for (const kind of [
      "style",
      "tile set",
      "vector tile",
      "sprite",
      "glyph",
    ]) {
      expect(problems.some((problem) => problem.includes(kind))).toBe(true);
    }
  });

  it("names a request to an origin that is neither the page's nor OpenFreeMap's, and a violation", () => {
    const problems = quickstartProblems({
      ...ok,
      requests: [...ok.requests, "https://tracker.example/x"],
      violations: [{ violatedDirective: "img-src", blockedURI: "blob" }],
    }) as string[];
    expect(problems.join("\n")).toContain("https://tracker.example/x");
    expect(problems.join("\n")).toContain("img-src");
  });
});
