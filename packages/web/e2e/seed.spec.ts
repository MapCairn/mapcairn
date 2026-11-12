// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";

// Seed for the Playwright planner and generator agents (.claude/agents). Generated tests start from here; keep it minimal.
test("seed", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/mapcairn/i);
});
