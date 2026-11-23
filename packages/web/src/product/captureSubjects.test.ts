// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectToPixel } from "./captureProjection";
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
      "#map=13.00/-33.97000/18.48000&basemap=bright",
    );
    expect(captureAddress(hero, "dark")).toBe(
      "#map=13.00/-33.97000/18.48000&basemap=fiord",
    );
  });

  it("use only basemaps whose tiles may be captured: OpenFreeMap's, never the OpenStreetMap tile layer", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      for (const basemap of Object.values(subject.basemaps)) {
        expect(["bright", "fiord"]).toContain(basemap);
      }
    }
  });

  it("measure a line whose two ends lie inside each picture, clear of the edges", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      for (const place of subject.arrangement.line) {
        const { x, y } = projectToPixel(
          { ...subject.view, width: subject.width, height: subject.height },
          place.latitude,
          place.longitude,
        );
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(subject.width);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(subject.height);
      }
    }
  });

  it("show one view at two sizes, so the phone and the wide screen see the same place and line", () => {
    const [narrow, wide] = CAPTURE_SUBJECTS;
    expect(narrow?.id).toBe("hero");
    expect(wide?.id).toBe("heroWide");
    expect(wide?.view).toEqual(narrow?.view);
    expect(wide?.arrangement).toEqual(narrow?.arrangement);
    expect(wide?.width).toBeGreaterThan(narrow?.width ?? 0);
  });

  it("give each subject its own byte budget in its row, the wide picture the larger", () => {
    for (const subject of CAPTURE_SUBJECTS) {
      expect(subject.budgetBytes).toBeGreaterThan(0);
    }
    expect(captureSubject("heroWide").budgetBytes).toBeGreaterThan(
      captureSubject("hero").budgetBytes,
    );
  });

  it("say in each picture's description the length it measures", () => {
    for (const { id } of CAPTURE_SUBJECTS) {
      expect(measuredReadout(id)).toBe("3.37 km");
      expect(PLATES[id].description).toContain(measuredReadout(id));
    }
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
