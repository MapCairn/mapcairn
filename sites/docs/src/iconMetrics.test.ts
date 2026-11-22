// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, it } from "vitest";
import { EXTERNAL_MARK_SIZE, ICON_SIZE, ICON_WEIGHT } from "./iconMetrics";

it("takes the icon size and weight from the tokens", () => {
  expect(ICON_SIZE).toBe(24);
  expect(ICON_WEIGHT).toBe("regular");
  expect(EXTERNAL_MARK_SIZE).toBeLessThan(ICON_SIZE);
});
