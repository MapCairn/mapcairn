import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { APP_ICONS } from "./appIcons";
import {
  CONTRAST_PAIRS,
  colourRoleRows,
  contrastRows,
  formatRatio,
  measurePair,
  ROLE_PAIRS,
} from "./guideData";

const { themeValues, representativeBackdrops, colourRoleNames } = tokenValues;

describe("contrastRows", () => {
  it("measures every pair in both themes and none fails AA", () => {
    const rows = contrastRows();
    expect(rows).toHaveLength(CONTRAST_PAIRS.length);
    for (const row of rows) {
      expect(row.light.passes, `${row.label} light`).toBe(true);
      expect(row.dark.passes, `${row.label} dark`).toBe(true);
    }
  });

  it("asks 4.5:1 of text and 3:1 of everything else", () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(pair.minimum).toBe(pair.kind === "text" ? 4.5 : 3);
    }
  });

  it("takes the worse of white and black under a translucent surface", () => {
    const pair = CONTRAST_PAIRS.find((entry) => entry.id === "text-surface");
    expect(pair).toBeDefined();
    if (!pair) {
      return;
    }
    const roles = themeValues.light.colour;
    const over = (backdrop: string) => {
      const under = compositeOver(roles.surface, backdrop);
      return contrastRatio(compositeOver(roles.text, under), under);
    };
    const worst = Math.min(
      over(representativeBackdrops.white),
      over(representativeBackdrops.black),
    );
    expect(measurePair(pair, roles)).toBeCloseTo(worst, 6);
    expect(worst).toBeLessThan(over(representativeBackdrops.white));
  });

  it("measures map overlays against every representative basemap", () => {
    const pair = CONTRAST_PAIRS.find((entry) => entry.id === "pin-basemap");
    expect(pair?.background).toBe("basemaps");
    if (!pair) {
      return;
    }
    const roles = themeValues.light.colour;
    const worst = Math.min(
      ...Object.values(representativeBackdrops).map((backdrop) =>
        contrastRatio(roles.mapPin, backdrop),
      ),
    );
    expect(measurePair(pair, roles)).toBeCloseTo(worst, 6);
  });

  it("reports a failure when a pair is below its minimum", () => {
    const pair = CONTRAST_PAIRS.find((entry) => entry.id === "text-surface");
    if (!pair) {
      throw new Error("missing pair");
    }
    const roles = { ...themeValues.light.colour, text: "#ffffff" };
    expect(measurePair(pair, roles)).toBeLessThan(pair.minimum);
  });
});

describe("formatRatio", () => {
  it("rounds down to two places so a near miss never reads as a pass", () => {
    expect(formatRatio(4.4999)).toBe("4.49:1");
    expect(formatRatio(21)).toBe("21.00:1");
  });
});

describe("colourRoleRows", () => {
  it("lists every colour role with its light and dark hex", () => {
    const rows = colourRoleRows();
    expect(rows.map((row) => row.role)).toEqual([...colourRoleNames]);
    for (const row of rows) {
      expect(row.lightHex).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      expect(row.darkHex).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    }
  });

  it("gives each role a measured pair or a reason it has none", () => {
    for (const row of colourRoleRows()) {
      const entry = ROLE_PAIRS[row.role];
      if (typeof entry === "string") {
        expect(CONTRAST_PAIRS.some((pair) => pair.id === entry)).toBe(true);
        expect(row.pair?.id).toBe(entry);
      } else {
        expect(entry.exempt.length).toBeGreaterThan(0);
        expect(row.pair).toBeUndefined();
      }
    }
  });
});

/** Lucide icon names imported by the app's sources, outside the style guide and tests. */
function importedIconNames(): string[] {
  const roots = [
    path.join(__dirname, "../../../map/src"),
    path.join(__dirname, ".."),
  ];
  const names = new Set<string>();
  for (const root of roots) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const file = String(entry);
      if (
        !/\.tsx?$/.test(file) ||
        /\.(test|spec)\.tsx?$/.test(file) ||
        file.split(path.sep).includes("designGuide")
      ) {
        continue;
      }
      const source = readFileSync(path.join(root, file), "utf8");
      for (const match of source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g,
      )) {
        for (const part of (match[1] ?? "").split(",")) {
          const name = part
            .trim()
            .split(/\s+as\s+/)[0]
            ?.trim();
          if (name && !name.startsWith("type ")) {
            names.add(name);
          }
        }
      }
    }
  }
  return [...names].sort();
}

describe("APP_ICONS", () => {
  it("is exactly the set of Lucide icons the app imports", () => {
    const names = importedIconNames();
    expect(names.length).toBeGreaterThan(10);
    expect(Object.keys(APP_ICONS).sort()).toEqual(names);
  });
});
