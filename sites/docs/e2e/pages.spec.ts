// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "@playwright/test";
import { open, prepare } from "./support";

test("the 404 page's document title is its heading, with links to the three starting points", async ({
  page,
}) => {
  await open(page, "/docs/this-page-does-not-exist/");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("This page doesn't exist");
  await expect(page).toHaveTitle(/^This page doesn't exist/);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(main.getByRole("link", { name: "API reference" })).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Troubleshooting" }),
  ).toBeVisible();
  await expect(main).not.toContainText("press /");
});

test("Docs is the current page on its own front page and the current section elsewhere", async ({
  page,
}) => {
  await prepare(page, "light", 1280);
  const docs = page
    .getByRole("navigation", { name: "Site links" })
    .getByRole("link", { name: "Docs" });
  await open(page, "/docs/");
  await expect(docs).toHaveAttribute("aria-current", "page");
  await open(page, "/docs/tasks/choose-a-basemap/");
  await expect(docs).toHaveAttribute("aria-current", "true");
});

for (const width of [390, 1280]) {
  test(`no two navigation landmarks share a label at ${width} px`, async ({
    page,
  }) => {
    await prepare(page, "light", width);
    await open(page, "/docs/tasks/choose-a-basemap/");
    if (width < 997) {
      await page.getByRole("button", { name: /navigation bar/i }).click();
    }
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll("nav")]
        .filter((nav) => nav.checkVisibility({ visibilityProperty: true }))
        .map((nav) => nav.getAttribute("aria-label") ?? "(no label)"),
    );
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
  });
}

for (const width of [320, 390]) {
  for (const path of [
    "/docs/architecture/",
    "/docs/architecture/data-layers/",
    "/docs/architecture/adding-an-adapter/",
  ]) {
    test(`the diagrams on ${path} fit the column at ${width} px, with a text alternative`, async ({
      page,
    }) => {
      await prepare(page, "light", width);
      await open(page, path);
      const figures = page.locator(".flowchart");
      expect(await figures.count()).toBeGreaterThan(0);
      const overflowing = await page.evaluate(() => [
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        ...[...document.querySelectorAll<HTMLElement>(".flowchart")].map(
          (figure) => figure.scrollWidth > figure.clientWidth,
        ),
      ]);
      expect(overflowing.every((over) => !over)).toBe(true);
      for (const svg of await page.locator(".flowchart svg").all()) {
        await expect(svg).toHaveAccessibleName(
          /^Diagram of \d+ boxes and \d+ arrows.* points to /,
        );
      }
    });
  }
}

for (const width of [320, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test(`the visual design page fits the column at ${width} px and draws both themes, whichever one is chosen (${theme})`, async ({
      page,
    }) => {
      await prepare(page, theme, width);
      await open(page, "/docs/design/visual-tokens/");
      const drawn = await page.evaluate(() => ({
        overflows:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        backgrounds: [
          ...document.querySelectorAll<HTMLElement>(".dt-theme"),
        ].map((block): [string, string] => [
          block.dataset.theme ?? "",
          getComputedStyle(block).backgroundColor,
        ]),
      }));
      expect(drawn.overflows).toBe(false);
      const colourOf = (name: string): Set<string> =>
        new Set(
          drawn.backgrounds
            .filter(([blockTheme]) => blockTheme === name)
            .map(([, colour]) => colour),
        );
      expect(colourOf("light").size).toBe(1);
      expect(colourOf("dark").size).toBe(1);
      expect([...colourOf("light")][0]).not.toBe([...colourOf("dark")][0]);
    });
  }
}

test("each roadmap card's link names its milestone", async ({ page }) => {
  await open(page, "/docs/roadmap/");
  const links = page.getByRole("link", { name: /^View .+ on GitHub$/ });
  expect(await links.count()).toBeGreaterThan(0);
  await expect(
    page.getByRole("link", { name: "View on GitHub", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Work under way. These run in parallel."),
  ).toBeVisible();
});
