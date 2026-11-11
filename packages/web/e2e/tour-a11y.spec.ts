import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";

/*
 * Accessibility of the first-visit tour card: axe and the control checks on
 * the welcome card, a step and the ending, in light and dark. Tagged @a11y,
 * so `npm run a11y` runs it.
 */

test.use({ firstVisit: true, reducedMotion: "reduce", fastCredits: true });

for (const colorScheme of ["light", "dark"] as const) {
  test(`the tour cards pass axe in the ${colorScheme} theme @a11y`, async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme });
    await mapPage.goto();
    const card = page.getByTestId("tour-card");
    await expect(card).toBeVisible();
    const audit = async () => {
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
    };
    await audit();
    await card.getByRole("button", { name: "Take the tour" }).click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await audit();
    for (const name of ["Next", "Next", "Finish"]) {
      await card.getByRole("button", { name }).click();
    }
    await expect(
      page.getByRole("heading", { name: "Tour finished" }),
    ).toBeVisible();
    await audit();
  });
}
