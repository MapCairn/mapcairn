// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, it } from "vitest";
import { EXTERNAL_MARK_SIZE, ICON_SIZE, ICON_STROKE } from "./iconMetrics";

it("takes the icon size and stroke from the tokens", () => {
  expect(ICON_SIZE).toBe(24);
  expect(ICON_STROKE).toBe(1.75);
  expect(EXTERNAL_MARK_SIZE).toBeLessThan(ICON_SIZE);
});
