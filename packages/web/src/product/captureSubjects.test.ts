// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPTURE_SCALE,
  CAPTURE_SUBJECTS,
  CAPTURE_THEMES,
  captureAddress,
  captureFileName,
  captureSubject,
  measuredReadout,
  TOTAL_BUDGET_BYTES,
} from "./captureSubjects";
import { plateGeometry, projectToPixel } from "./plateGeometry";
import { PLATES } from "./productContent";

/** The folder the pictures are committed to, beside the page's code. */
const CAPTURES = path.resolve(__dirname, "captures");

/** The width and height of a WebP file, read from its header, or null if it is not a WebP. */
function webpSize(file: Buffer): { width: number; height: number } | null {
  if (
    file.toString("ascii", 0, 4) !== "RIFF" ||
    file.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = file.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      width: file.readUInt16LE(26) & 0x3fff,
      height: file.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = file.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return {
      width: file.readUIntLE(24, 3) + 1,
      height: file.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

describe("the capture subjects", () => {
  it("name each picture once, for each theme", () => {
    const names = CAPTURE_SUBJECTS.flatMap(({ id }) =>
      CAPTURE_THEMES.map((theme) => captureFileName(id, theme)),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("hero-light.webp");
    expect(names).toContain("hero-dark.webp");
  });

  it("find a subject by its id, and fail on one that does not exist", () => {
    expect(captureSubject("hero").id).toBe("hero");
    expect(() => captureSubject("nowhere" as never)).toThrow(
      "No capture subject",
    );
  });

  it("open the playground over the subject's view with the basemap of the theme, in the address the playground writes", () => {
    const hero = captureSubject("hero");
    expect(captureAddress(hero, "light")).toBe(
      "#map=13.00/-33.93650/18.40700&basemap=bright",
    );
    expect(captureAddress(hero, "dark")).toBe(
      "#map=13.00/-33.93650/18.40700&basemap=fiord",
    );
  });

  it("use only basemaps whose tiles may be captured: OpenFreeMap's, never the OpenStreetMap tile layer", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      for (const basemap of Object.values(subject.basemaps)) {
        expect(["bright", "fiord"]).toContain(basemap);
      }
    }
  });

  it("measure a hero line whose two ends lie inside the picture, clear of the edges", () => {
    const hero = captureSubject("hero");
    if (hero.arrangement.kind !== "measure") {
      throw new Error("The hero measures a line.");
    }
    for (const place of hero.arrangement.line) {
      const { x, y } = projectToPixel(
        { ...hero.view, width: hero.width, height: hero.height },
        place.latitude,
        place.longitude,
      );
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(hero.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(hero.height);
    }
  });

  it("give every subject a collar of a few ticks on each edge", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      const { longitudeTicks, latitudeTicks } = plateGeometry({
        ...subject.view,
        width: subject.width,
        height: subject.height,
      });
      expect(longitudeTicks.length).toBeGreaterThanOrEqual(2);
      expect(latitudeTicks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("give each subject its own byte budget, and a kind of arrangement, in its row", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      expect(subject.budgetBytes).toBeGreaterThan(0);
      expect(["measure", "basemap-picker"]).toContain(subject.arrangement.kind);
    }
    expect(captureSubject("hero").budgetBytes).toBeGreaterThan(
      captureSubject("basemaps").budgetBytes,
    );
  });

  it("read a length only from a subject that measures one", () => {
    expect(measuredReadout("hero")).toBe("3.42 km");
    expect(() => measuredReadout("basemaps")).toThrow("measures nothing");
  });

  it("say in the hero's description the length its picture measures", () => {
    expect(PLATES.hero.description).toContain(measuredReadout("hero"));
  });
});

describe("the committed pictures", () => {
  for (const subject of CAPTURE_SUBJECTS) {
    for (const theme of CAPTURE_THEMES) {
      const name = captureFileName(subject.id, theme);
      const file = path.join(CAPTURES, name);

      it(`${name} is a WebP of the size the page gives it, at ${CAPTURE_SCALE}x, within its byte budget`, () => {
        expect(existsSync(file), `${name} is committed`).toBe(true);
        const bytes = readFileSync(file);
        expect(webpSize(bytes)).toEqual({
          width: subject.width * CAPTURE_SCALE,
          height: subject.height * CAPTURE_SCALE,
        });
        expect(bytes.length).toBeLessThanOrEqual(subject.budgetBytes);
      });
    }
  }

  it("together weigh no more than the page's budget for them", () => {
    const total = CAPTURE_SUBJECTS.flatMap(({ id }) =>
      CAPTURE_THEMES.map(
        (theme) =>
          statSync(path.join(CAPTURES, captureFileName(id, theme))).size,
      ),
    ).reduce((sum, size) => sum + size, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES);
  });
});
