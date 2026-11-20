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
  EN_GB_CATALOGUE,
  FakeMessageCatalogue,
  feedUrl,
  type IdentifiableLayerDefinition,
  type IdentifyTarget,
  identifyUrl,
  isFeedLayer,
  isIdentifiable,
  isMessageKey,
  type LayerDefinition,
  LayerError,
  parseTemplate,
  readyLayers,
  resolveText,
  SAMPLE_IDENTIFY_LAYER,
  tileUrl,
  validateLayerDefinition,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_RESPONSE_BYTES } from "../adapters/layers/FetchLayerSource";
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

/**
 * How many times the largest size a definition documents the source's default
 * response limit must be, so a feed that grows a little still loads.
 */
const RESPONSE_LIMIT_MARGIN = 4;

/**
 * The largest size, in bytes, an English `dataCost` text states, such as
 * "about 30 KB, up to 220 KB for a week" (220 KB), in KB, MB or GB, with a
 * comma or a point in the figure. The text must be a
 * message key whose English reads that way, so the test fails, rather than
 * passes, when a cost is worded in a way this does not understand.
 */
function largestDocumentedBytes(dataCost: unknown): number {
  const text = EN_GB_CATALOGUE[dataCost as keyof typeof EN_GB_CATALOGUE];
  const unitBytes = { KB: 1000, MB: 1_000_000, GB: 1_000_000_000 };
  const sizes = [...String(text).matchAll(/([\d,.]+) (KB|MB|GB)/g)].map(
    ([, amount, unit]) =>
      Number((amount ?? "").replaceAll(",", "")) *
      unitBytes[unit as keyof typeof unitBytes],
  );
  expect(sizes.length, `no size in "${text}"`).toBeGreaterThan(0);
  return Math.max(...sizes);
}

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

/** Whether `value` is a host text, `{ key, text }`, rather than a plain string or a shipped key. */
function isHostText(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { key?: unknown }).key === "string" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

describe("the host's layer definitions", () => {
  it("has layers, with unique ids, in group then name order", () => {
    expect(LAYER_DEFINITIONS.length).toBeGreaterThan(0);
    const ids = LAYER_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    const english = new FakeMessageCatalogue();
    const keys = LAYER_DEFINITIONS.map(
      (d) =>
        `${resolveText(english, d.group)}\u0000${resolveText(english, d.name)}`,
    );
    const collator = new Intl.Collator("en-GB");
    expect(keys).toEqual([...keys].sort(collator.compare));
  });

  it("keeps the English order whatever the runtime's default locale collates", async () => {
    const expected = LAYER_DEFINITIONS.map((definition) => definition.id);
    const original = String.prototype.localeCompare;
    // A runtime whose default locale orders text the other way round.
    vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      that: string,
      locales?: Intl.LocalesArgument,
      options?: Intl.CollatorOptions,
    ) {
      const order = original.call(this, that, locales, options);
      return locales === undefined ? -order : order;
    });
    try {
      vi.resetModules();
      const reloaded = await import("./index");
      expect(reloaded.LAYER_DEFINITIONS.map((d) => d.id)).toEqual(expected);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("writes its own readable text as message keys the English catalogue holds, or as host text", () => {
    const strings = (value: unknown): string[] => {
      if (typeof value === "string") {
        return [value];
      }
      if (isHostText(value)) {
        return [];
      }
      if (Array.isArray(value)) {
        return value.flatMap(strings);
      }
      return value !== null && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];
    };
    for (const definition of LAYER_DEFINITIONS) {
      const dotted = strings(definition).filter((text) =>
        /^layer\.[\w.-]+$/.test(text),
      );
      expect(dotted.length, definition.id).toBeGreaterThan(0);
      for (const text of dotted) {
        expect(isMessageKey(text), `${definition.id}: ${text}`).toBe(true);
      }
      for (const text of [definition.name, definition.description]) {
        expect(isMessageKey(text) || isHostText(text), definition.id).toBe(
          true,
        );
      }
      expect(isMessageKey(definition.group), definition.id).toBe(true);
    }
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

      it("has its documented data cost well under the source's default response limit", () => {
        const largest = Math.max(
          largestDocumentedBytes(definition.dataCost),
          definition.detail
            ? largestDocumentedBytes(definition.detail.dataCost)
            : 0,
        );
        expect(DEFAULT_MAX_RESPONSE_BYTES).toBeGreaterThanOrEqual(
          RESPONSE_LIMIT_MARGIN * largest,
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
