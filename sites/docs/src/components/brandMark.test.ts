// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { STONES } from "./BrandMark";

it("draws the stones the reference site draws", () => {
  const host = readFileSync(
    new URL("../../../../packages/web/src/app/cairnStones.ts", import.meta.url),
    "utf8",
  );
  for (const { points, offset } of STONES) {
    expect(host).toContain(`points: "${points}"`);
    if (offset) {
      expect(host).toContain(`offset: "${offset}"`);
    }
  }
  expect((host.match(/points: "/g) ?? []).length).toBe(STONES.length);
});
