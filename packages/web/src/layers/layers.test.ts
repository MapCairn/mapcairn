// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ControlValues,
  decodeDetail,
  decodeFeed,
  defaultControlValues,
  feedUrl,
  type IdentifiableLayerDefinition,
  type IdentifyTarget,
  identifyUrl,
  isFeedLayer,
  isIdentifiable,
  type LayerDefinition,
  LayerError,
  parseTemplate,
  readyLayers,
  SAMPLE_IDENTIFY_LAYER,
  tileUrl,
  validateLayerDefinition,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../constants/securityHeaders";
import {
  createHostLayerCatalogue,
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

/** Where a tap on a map is taken to be, for the URL a layer's `identify` block asks. */
const IDENTIFY_TARGET: IdentifyTarget = {
  latlng: { lat: -33.9249, lng: 18.4241 },
  zoom: 10,
};

/** The origins a layer's requests go to, by the content security policy directive that must allow them. */
function requestedOrigins(
  definition: LayerDefinition,
  controls: ControlValues,
): { readonly connect: string[]; readonly image: string[] } {
  if (isFeedLayer(definition)) {
    return {
      connect: [
        new URL(feedUrl(definition, controls, NOW)).origin,
        ...(definition.detail?.origins ?? []),
      ],
      image: [],
    };
  }
  const tiles = new URL(tileUrl(definition, controls, NOW)).origin;
  const identify = isIdentifiable(definition)
    ? [new URL(identifyUrl(definition, controls, NOW, IDENTIFY_TARGET)).origin]
    : [];
  return { connect: [tiles, ...identify], image: [tiles] };
}

/** One line for each origin a layer asks that the production CSP does not allow, saying where to add it. */
function cspGaps(definition: LayerDefinition): string[] {
  const needed = requestedOrigins(
    definition,
    defaultControlValues(definition, NOW),
  );
  const missing = (directive: string, origins: readonly string[]) =>
    origins
      .filter((origin) => !(CSP.get(directive) ?? []).includes(origin))
      .map(
        (origin) =>
          `add ${origin} to ${directive} in public/_headers and securityHeaders.ts`,
      );
  return [
    ...missing("connect-src", needed.connect),
    ...missing("img-src", needed.image),
  ];
}

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

  it("builds a catalogue that lists them all", () => {
    expect(readyLayers(createHostLayerCatalogue().getState())).toEqual(
      LAYER_DEFINITIONS,
    );
  });

  describe("the origin check for a layer that identifies", () => {
    const identifyingAt = (url: string): IdentifiableLayerDefinition => ({
      ...SAMPLE_IDENTIFY_LAYER,
      identify: { ...SAMPLE_IDENTIFY_LAYER.identify, url },
    });
    /** The sample layer with its tiles and its identify URL on the given origins. */
    const onOrigins = (tiles: string, identify: string) => ({
      ...identifyingAt(`${identify}/identify?bbox={bbox}`),
      source: {
        ...SAMPLE_IDENTIFY_LAYER.source,
        tiles: `${tiles}/flood/{z}/{y}/{x}.png`,
      },
    });
    const allowed = "https://ows.globalfloods.eu";

    it("reports an identify origin that connect-src does not allow, and not for img-src", () => {
      expect(cspGaps(onOrigins(allowed, "https://api.test"))).toEqual([
        "add https://api.test to connect-src in public/_headers and securityHeaders.ts",
      ]);
    });

    it("accepts an identify origin the policy already allows for tiles", () => {
      expect(CSP.get("connect-src")).toContain(allowed);
      expect(cspGaps(onOrigins(allowed, allowed))).toEqual([]);
    });

    it("reports each origin once for each directive that lacks it", () => {
      expect(cspGaps(SAMPLE_IDENTIFY_LAYER)).toEqual([
        "add https://tiles.test to connect-src in public/_headers and securityHeaders.ts",
        "add https://api.test to connect-src in public/_headers and securityHeaders.ts",
        "add https://tiles.test to img-src in public/_headers and securityHeaders.ts",
      ]);
    });
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
      expect(cspGaps(definition)).toEqual([]);
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
