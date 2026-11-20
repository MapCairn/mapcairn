// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { collapseCredits } from "./support/states";

/**
 * Moves every rule that names one of a button's recipe classes (every class
 * but the last, which is the component's own, as `IconButton` appends it) to
 * a stylesheet added last, as if the recipe's stylesheet had loaded after the
 * component's. A recipe that sat at the component's specificity would then
 * beat it; one in a lower cascade layer still loses, because the copies keep
 * their `@layer` block.
 */
async function loadRecipeLast(button: Locator): Promise<void> {
  await button.evaluate((element) => {
    const classes = [...element.classList];
    const recipeClasses = classes.slice(0, -1);
    const named = (text: string): boolean =>
      recipeClasses.some((name) =>
        new RegExp(`\\.${CSS.escape(name)}(?![\\w-])`).test(text),
      );
    const copies: string[] = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (named(rule.cssText)) {
          copies.push(rule.cssText);
        }
      }
    }
    const last = document.createElement("style");
    last.textContent = copies.join("\n");
    document.head.append(last);
  });
}

test.describe("a component's own style beats a primitive's recipe", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  test("the credits button keeps its surface, radius and shadow when the recipe loads last", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await mapPage.goto();
    await collapseCredits(mapPage);
    await page.mouse.move(0, 0);
    await loadRecipeLast(mapPage.creditsButton);
    const style = await mapPage.creditsButton.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        radius: computed.borderRadius,
        shadow: computed.boxShadow,
      };
    });
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.background).not.toBe("transparent");
    expect(style.radius).toBe("50%");
    expect(style.shadow).not.toBe("none");
  });

  test("hovering the credits button keeps its surface when the recipe loads last", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await mapPage.goto();
    await collapseCredits(mapPage);
    await loadRecipeLast(mapPage.creditsButton);
    await mapPage.creditsButton.hover();
    const background = await mapPage.creditsButton.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
    expect(background).not.toBe("transparent");
  });

  test("the host's default focus outline matches the one the recipes draw", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await page.keyboard.press("Shift");
    await page.evaluate(() => {
      const plain = document.createElement("button");
      plain.dataset.testid = "plain-focus-target";
      plain.textContent = "Plain";
      document.body.append(plain);
    });
    const outlineOf = async (target: Locator) => {
      await target.focus();
      await expect(target).toBeFocused();
      return target.evaluate((element) => {
        const computed = getComputedStyle(element);
        return [
          computed.outlineStyle,
          computed.outlineWidth,
          computed.outlineColor,
          computed.outlineOffset,
        ];
      });
    };
    const recipe = await outlineOf(mapPage.settingsButton);
    const host = await outlineOf(page.getByTestId("plain-focus-target"));
    expect(recipe[0]).toBe("solid");
    expect(host).toEqual(recipe);
  });
});
