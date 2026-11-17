// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTOUR_INTERVAL_METRES,
  CONTOURS,
  INDEX_CONTOUR_METRES,
  SUMMIT,
} from "./contours";

const SCRIPT = path.resolve(
  __dirname,
  "../../../../scripts/generateContours.mjs",
);

describe("the committed contours", () => {
  it("are exactly what scripts/generateContours.mjs makes", () => {
    const generated = JSON.parse(
      execFileSync(process.execPath, [SCRIPT, "--json"], { encoding: "utf8" }),
    );
    expect(generated).toEqual({
      contours: CONTOURS,
      summit: SUMMIT,
      interval: CONTOUR_INTERVAL_METRES,
      index: INDEX_CONTOUR_METRES,
    });
  });
});
