import { expect, type Page } from "@playwright/test";
import { E2E } from "./selectors";

/** Opens map controls after the map has mounted. */
export async function ensurePanelOpen(page: Page) {
  await waitForMapReady(page);
  const toggle = page.getByTestId(E2E.panelToggle);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
}

/** Waits for Leaflet's first painted frame. */
export async function waitForMapReady(page: Page) {
  await expect(page.locator('[data-entrance-ready="true"]')).toBeVisible({
    timeout: 15_000,
  });
}

/** Closes the control panel if it is open. */
export async function ensurePanelClosed(page: Page) {
  const toggle = page.getByTestId(E2E.panelToggle);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
}
