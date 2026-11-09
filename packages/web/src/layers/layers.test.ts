import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeDetail,
  decodeFeed,
  defaultControlValues,
  feedUrl,
  isFeedLayer,
  type LayerDefinition,
  LayerError,
  parseTemplate,
  tileUrl,
  validateLayerDefinition,
} from "@karta/core";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../constants/securityHeaders";
import {
  createHostLayerRegistry,
  LAYER_DECODERS,
  LAYER_DEFINITIONS,
  LAYER_FORMATTERS,
} from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, "fixtures");
const ATTRIBUTIONS = readFileSync(
  resolve(here, "../../../../ATTRIBUTIONS.md"),
  "utf8",
);

/** What the fixture manifest says about one feed layer. */
interface FixtureEntry {
  readonly file: string;
  readonly features: number;
  readonly detail?: { readonly file: string; readonly shapes: number };
}

const MANIFEST = JSON.parse(
  readFileSync(resolve(FIXTURES, "manifest.json"), "utf8"),
) as Record<string, FixtureEntry>;

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, file), "utf8"));
}

/** The production Content-Security-Policy, as sources by directive. */
const CSP = new Map(
  buildContentSecurityPolicy()
    .split(";")
    .map((directive) => directive.trim().split(/\s+/))
    .map(([name, ...sources]) => [name as string, sources]),
);

const NOW = Date.UTC(2026, 10, 9, 12);

function count(decode: () => readonly unknown[]): number {
  try {
    return decode().length;
  } catch (error) {
    if (error instanceof LayerError && error.kind === "empty") {
      return 0;
    }
    throw error;
  }
}

describe("the host's layer definitions", () => {
  it("has layers, with unique ids, in group then name order", () => {
    expect(LAYER_DEFINITIONS.length).toBeGreaterThan(0);
    const ids = LAYER_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = LAYER_DEFINITIONS.map((d) => `${d.group}\u0000${d.name}`);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  it("builds a registry that lists them all", () => {
    expect(createHostLayerRegistry().list()).toEqual(LAYER_DEFINITIONS);
  });

  it("lists every fixture file in the manifest, and nothing else", () => {
    const referenced = new Set(
      Object.values(MANIFEST).flatMap((entry) => [
        entry.file,
        ...(entry.detail ? [entry.detail.file] : []),
      ]),
    );
    const files = readdirSync(FIXTURES).filter((f) => f !== "manifest.json");
    expect([...referenced].sort()).toEqual(files.sort());
    for (const id of Object.keys(MANIFEST)) {
      expect(
        LAYER_DEFINITIONS.some((d) => d.id === id && isFeedLayer(d)),
        `manifest entry ${id} has no feed definition`,
      ).toBe(true);
    }
  });

  describe.each(
    LAYER_DEFINITIONS.map((definition) => [definition.id, definition] as const),
  )("%s", (_id, definition: LayerDefinition) => {
    it("passes the schema", () => {
      expect(
        validateLayerDefinition(definition, {
          decoders: LAYER_DECODERS,
          formatters: LAYER_FORMATTERS,
        }),
      ).toEqual([]);
    });

    it("fills its URL from its controls' defaults", () => {
      const controls = defaultControlValues(definition, NOW);
      const url = isFeedLayer(definition)
        ? feedUrl(definition, controls, NOW)
        : tileUrl(definition, controls, NOW);
      expect(url).toMatch(/^https:\/\//);
      for (const { name } of parseTemplate(url)) {
        expect(["z", "x", "y", "bbox-epsg-3857"]).toContain(name);
      }
    });

    it("has every origin it requests allowed by the production CSP", () => {
      const controls = defaultControlValues(definition, NOW);
      const connect = CSP.get("connect-src") ?? [];
      const image = CSP.get("img-src") ?? [];
      if (isFeedLayer(definition)) {
        const origins = [
          new URL(feedUrl(definition, controls, NOW)).origin,
          ...(definition.detail?.origins ?? []),
        ];
        for (const origin of origins) {
          expect(
            connect,
            `add ${origin} to connect-src in public/_headers and securityHeaders.ts`,
          ).toContain(origin);
        }
      } else {
        const origin = new URL(tileUrl(definition, controls, NOW)).origin;
        expect(
          connect,
          `add ${origin} to connect-src in public/_headers and securityHeaders.ts`,
        ).toContain(origin);
        expect(
          image,
          `add ${origin} to img-src in public/_headers and securityHeaders.ts`,
        ).toContain(origin);
      }
    });

    it("has its credit in ATTRIBUTIONS.md", () => {
      for (const { text } of definition.attribution) {
        expect(
          ATTRIBUTIONS.includes(text),
          `add "${text}" to ATTRIBUTIONS.md`,
        ).toBe(true);
      }
    });

    if (isFeedLayer(definition)) {
      it("decodes its recorded fixture to the expected number of features", () => {
        const entry = MANIFEST[definition.id];
        expect(
          entry,
          `add a fixture for ${definition.id} to fixtures/manifest.json`,
        ).toBeDefined();
        const raw = fixture((entry as FixtureEntry).file);
        expect(count(() => decodeFeed(definition, raw, LAYER_DECODERS))).toBe(
          entry?.features,
        );
      });

      if (definition.detail) {
        it("decodes its recorded detail fixture to shapes", () => {
          const detail = MANIFEST[definition.id]?.detail;
          expect(
            detail,
            `add a detail fixture for ${definition.id}`,
          ).toBeDefined();
          const shapes = decodeDetail(
            definition,
            fixture((detail as NonNullable<typeof detail>).file),
            LAYER_DECODERS,
          );
          expect(shapes).toHaveLength(detail?.shapes ?? -1);
        });
      }
    }
  });
});
