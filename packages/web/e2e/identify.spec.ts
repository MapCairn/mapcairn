// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import {
  IDENTIFY_FLOOD,
  IDENTIFY_RAIN,
  mockIdentifyData,
} from "./support/kindLayers";
import { scriptLayers } from "./support/services";
import { IDENTIFY_FEEDBACK_MS, TIMER_SLACK_MS } from "./support/timers";

/*
 * Raster layers that answer a tap: the card, the list, nothing found, a slow
 * answer with its waiting line, a failure, Escape during the wait and the I
 * key. The two sample layers are data in `support/kindLayers.ts` and the
 * test answers their requests, so nothing real is asked.
 */

const AT_CENTRE = "map=7.00/30.00000/31.00000";
const FLOOD = "kind-identify-flood";
const RAIN = "kind-identify-rain";

test.describe("identify at a tap", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await scriptLayers(page, [IDENTIFY_FLOOD, IDENTIFY_RAIN]);
  });

  test("asks nothing until a tap, then opens the card of what the layer found at the tapped place", async ({
    page,
    mapPage,
  }) => {
    const service = await mockIdentifyData(page);
    service.set("flood", "found");
    await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
    // Moving over the map is not a request; only a tap is.
    const { width, height } = await mapPage.mapSize();
    await page.mouse.move(width / 3, height / 3);
    await page.mouse.move(width / 2, height / 2);
    await mapPage.host.click();
    await expect(page.getByTestId("feature-card-heading")).toHaveText(
      "Gauge 4",
    );
    await expect(page.getByTestId("feature-card-heading")).toBeFocused();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("feature-card")).toContainText("Depth 1.5 m");
    expect(service.queries).toHaveLength(1);
    const asked = new URL(service.queries[0] as string).searchParams;
    expect(Number(asked.get("lng"))).toBeCloseTo(31, 1);
    expect(Number(asked.get("lat"))).toBeCloseTo(30, 1);
    // One feature is said by its card taking focus, not by a message.
    expect(await mapPage.announcements()).not.toContain("Nothing found here.");
  });

  test("opens a list when two layers each find something, and each row opens its card", async ({
    page,
    mapPage,
  }) => {
    const service = await mockIdentifyData(page);
    service.set("flood", "found");
    service.set("rain", "found");
    await mapPage.goto(`#layers=${FLOOD},${RAIN}&${AT_CENTRE}`);
    await mapPage.host.click();
    await expect(page.getByTestId("feature-choices-heading")).toHaveText(
      "2 features here",
    );
    await expect(page.getByTestId("feature-choices-heading")).toBeFocused();
    await expect(mapPage.politeAnnouncer).toContainText(
      "2 features here. Choose one from the list.",
    );
    const rows = page.getByTestId("feature-choices-row");
    await expect(rows).toHaveCount(2);
    await rows.filter({ hasText: "Rain gauge 7" }).click();
    await expect(page.getByTestId("feature-card-heading")).toHaveText(
      "Rain gauge 7",
    );
    await page.getByTestId("feature-card-back").click();
    await expect(page.getByTestId("feature-choices-heading")).toBeFocused();
  });

  test("says when nothing was found, and opens nothing", async ({
    page,
    mapPage,
  }) => {
    await mockIdentifyData(page);
    await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
    await mapPage.host.click();
    await expect(mapPage.politeAnnouncer).toContainText("Nothing found here.");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(page.getByTestId("feature-card")).toHaveCount(0);
  });

  test("says which layer did not answer when a request fails", async ({
    page,
    mapPage,
  }) => {
    const service = await mockIdentifyData(page);
    service.set("flood", "error");
    await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
    await mapPage.host.click();
    await expect(mapPage.assertiveAnnouncer).toContainText(
      "Sample flood depth did not answer.",
    );
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
  });

  test("answers one layer and names the one that failed, in one message", async ({
    page,
    mapPage,
  }) => {
    const service = await mockIdentifyData(page);
    service.set("flood", "found");
    service.set("rain", "error");
    await mapPage.goto(`#layers=${FLOOD},${RAIN}&${AT_CENTRE}`);
    await mapPage.host.click();
    await expect(page.getByTestId("feature-card-heading")).toHaveText(
      "Gauge 4",
    );
    await expect(mapPage.politeAnnouncer).toContainText(
      "Sample rainfall did not answer.",
    );
  });

  test.describe("a slow answer", () => {
    test("shows the waiting line after a moment, says nothing while it waits, and shows the card when it answers", async ({
      page,
      mapPage,
    }) => {
      await page.clock.install();
      const service = await mockIdentifyData(page);
      service.set("flood", "hold");
      await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
      await mapPage.host.click();
      await expect.poll(() => service.queries.length).toBe(1);
      const line = page.getByTestId("identify-status");
      await expect(line).toHaveCount(0);
      await page.clock.runFor(IDENTIFY_FEEDBACK_MS + TIMER_SLACK_MS);
      // The line is a status region, which is how a screen reader hears the wait.
      await expect(line.getByRole("status")).toHaveText(
        "Looking up what is here",
      );
      // The result then goes through the announcer, which the wait did not use.
      expect(await mapPage.announcements()).toEqual([]);
      await service.release();
      await expect(page.getByTestId("feature-card-heading")).toHaveText(
        "Gauge 4",
      );
      await expect(line).toHaveCount(0);
    });

    test("Escape ends the wait and its line, and a late answer opens nothing", async ({
      page,
      mapPage,
    }) => {
      await page.clock.install();
      const service = await mockIdentifyData(page);
      service.set("flood", "hold");
      await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
      await mapPage.host.click();
      await expect.poll(() => service.queries.length).toBe(1);
      await page.clock.runFor(IDENTIFY_FEEDBACK_MS + TIMER_SLACK_MS);
      await expect(page.getByTestId("identify-status")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("identify-status")).toHaveCount(0);
      await service.release();
      await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
      await expect(page.getByTestId("feature-card")).toHaveCount(0);
      expect(await mapPage.announcements()).not.toContain(
        "Nothing found here.",
      );
    });

    test("a second tap replaces the first, and only the second answer opens", async ({
      page,
      mapPage,
    }) => {
      const service = await mockIdentifyData(page);
      service.set("flood", "hold");
      await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
      await mapPage.host.click();
      await expect.poll(() => service.queries.length).toBe(1);
      await mapPage.host.click({ position: { x: 40, y: 200 } });
      await expect.poll(() => service.queries.length).toBe(2);
      service.set("flood", "found");
      await service.release();
      await expect(page.getByTestId("feature-card-heading")).toHaveText(
        "Gauge 4",
      );
      await expect(page.getByTestId("feature-card")).toHaveCount(1);
    });
  });

  test.describe("the I key", () => {
    test("asks at the centre of the map and opens the card", async ({
      page,
      mapPage,
    }) => {
      const service = await mockIdentifyData(page);
      service.set("flood", "found");
      await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
      await mapPage.focusMap();
      await page.keyboard.press("i");
      await expect(page.getByTestId("feature-card-heading")).toHaveText(
        "Gauge 4",
      );
      await expect(page.getByTestId("feature-card-heading")).toBeFocused();
      const asked = new URL(service.queries[0] as string).searchParams;
      expect(Number(asked.get("lng"))).toBeCloseTo(31, 1);
      expect(Number(asked.get("lat"))).toBeCloseTo(30, 1);
    });

    test("says what the layers found, and nothing before they have answered", async ({
      page,
      mapPage,
    }) => {
      await mockIdentifyData(page);
      await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
      await mapPage.focusMap();
      await page.keyboard.press("i");
      await expect(mapPage.politeAnnouncer).toContainText(
        "Nothing found here.",
      );
      expect(await mapPage.announcements()).not.toContain(
        "No features at the centre of the map.",
      );
    });
  });

  test.describe("the Layers section", () => {
    test("says an identifiable layer can be tapped while it is on", async ({
      page,
      mapPage,
    }) => {
      await mockIdentifyData(page);
      await mapPage.goto(`#layers=${FLOOD}&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId(`layer-identify-hint-${FLOOD}`)).toHaveText(
        "Tap the map to see details for this layer.",
      );
      await expect(page.getByTestId(`layer-identify-hint-${RAIN}`)).toHaveCount(
        0,
      );
    });
  });
});
