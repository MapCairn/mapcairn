// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { DefinitionText, HostText } from "@mapcairn/core";
import { AF_DEFINITION_TEXTS } from "../src/i18n/afDefinitionTexts";
import earthAtNight from "../src/layers/definitions/earth-at-night";
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { waitForStableLayout } from "./support/states";

/*
 * A host-keyed definition read in a second language. The reference site's
 * Earth at night layer writes its name and description as `{ key, text }`;
 * the Afrikaans catalogue translates them from `definitionTexts`, and a
 * language without an entry shows the source text. The expected words come
 * from the definition and the Afrikaans table, so the spec follows a copy
 * edit and fails if the definition goes back to a shipped key.
 */

/** The `{ key, text }` a definition field holds, or a failure when it holds a plain string or a shipped key. */
function hostTextOf(field: DefinitionText): HostText {
  if (typeof field === "string") {
    throw new Error(`Expected host text, found the string "${field}".`);
  }
  return field;
}

const NAME = hostTextOf(earthAtNight.name);
const DESCRIPTION = hostTextOf(earthAtNight.description as DefinitionText);
/** The bidirectional isolate marks (U+2066 to U+2069) around a substituted name. */
const ISOLATES = /[\u2066-\u2069]/g;

const AFRIKAANS_NAME = AF_DEFINITION_TEXTS[NAME.key] as string;
const AFRIKAANS_DESCRIPTION = AF_DEFINITION_TEXTS[DESCRIPTION.key] as string;

test.describe("a host-keyed definition in Afrikaans", () => {
  test.use({ reducedMotion: "reduce", language: "af" });

  test("shows the translated name and description, and its switch is named in Afrikaans", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    const item = page.getByTestId(`layer-${earthAtNight.id}`);
    await expect(item).toContainText(AFRIKAANS_NAME);
    await expect(item).toContainText(AFRIKAANS_DESCRIPTION);
    await expect(item).not.toContainText(NAME.text);
    await expect(item).not.toContainText(DESCRIPTION.text);
    const toggle = item.getByRole("switch", { name: AFRIKAANS_NAME });
    await expect(toggle).not.toBeChecked();
  });

  test("turns on from the keyboard, announces it in Afrikaans and names its control in Afrikaans", async ({
    page,
    mapPage,
    messages,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    const item = page.getByTestId(`layer-${earthAtNight.id}`);
    const toggle = item.getByRole("switch", { name: AFRIKAANS_NAME });
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    const opacity = messages["layer.control.opacity"];
    await expect(item.getByRole("slider", { name: opacity })).toBeVisible();
    const spoken = messages["announce.layerOn"].replace(
      "{name}",
      AFRIKAANS_NAME,
    );
    await expect
      .poll(async () => (await mapPage.announcements()).join("\n"))
      .toContain(spoken);
  });

  test("passes axe and names every control, with the layer off and on @a11y", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    const item = page.getByTestId(`layer-${earthAtNight.id}`);
    await item.scrollIntoViewIfNeeded();
    await waitForStableLayout(page);
    expect(await axeViolations(page)).toEqual([]);

    await item.getByRole("switch", { name: AFRIKAANS_NAME }).click();
    await expect(item.getByRole("switch")).toBeChecked();
    await waitForStableLayout(page);
    expect(await axeViolations(page)).toEqual([]);
    expect((await inspectControls(page)).unnamed).toEqual([]);
  });
});

test.describe("a host key with no entry in the language", () => {
  test.use({ reducedMotion: "reduce", language: "ar" });

  test("shows its source text, and the switch and announcement use it", async ({
    page,
    mapPage,
    messages,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    const item = page.getByTestId(`layer-${earthAtNight.id}`);
    await expect(item).toContainText(NAME.text);
    await expect(item).toContainText(DESCRIPTION.text);
    const toggle = item.getByRole("switch", { name: NAME.text });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    // A right-to-left sentence isolates the name; the words are what counts.
    const spoken = messages["announce.layerOn"].replace("{name}", NAME.text);
    await expect
      .poll(async () =>
        (await mapPage.announcements()).join("\n").replace(ISOLATES, ""),
      )
      .toContain(spoken);
  });
});
