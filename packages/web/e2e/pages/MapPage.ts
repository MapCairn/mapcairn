// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Locator, type Page } from "@playwright/test";
import { LONG_PRESS_DELAY_MS, TIMER_SLACK_MS } from "../support/timers";

/** How long the first map frame may take: the engine chunk, the worker and the style. */
export const MAP_READY_TIMEOUT_MS = 20_000;

/** The view encoded in the `#map=` part of the address. */
export interface HashView {
  readonly zoom: number;
  readonly lat: number;
  readonly lng: number;
  readonly bearing: number;
}

/** A sheet detent, as `data-detent` reports it. */
export type Detent = "peek" | "half" | "full";

/**
 * The map page and its chrome, located by role and accessible name wherever
 * the app gives one, and by `data-testid` otherwise.
 *
 * @remarks Groups follow the chrome slots in DESIGN.md: the search pill
 *   (top-start), the end stack (map controls and zoom), the sheet or side
 *   panel, the measure toolbar (bottom-centre), the readout (bottom-start)
 *   and the credits (bottom-end).
 */
export class MapPage {
  readonly page: Page;

  /** The page's visually hidden h1. */
  readonly heading: Locator;
  readonly skipLink: Locator;
  /** The focusable map region named "Map". */
  readonly region: Locator;
  /** The element that carries `data-map-host`, `data-zoom` and `aria-busy`. */
  readonly host: Locator;
  /** The chrome root, which carries `data-layout` and `data-hide-bottom`. */
  readonly chrome: Locator;

  readonly searchLandmark: Locator;
  readonly searchInput: Locator;
  readonly searchClear: Locator;
  readonly searchList: Locator;
  readonly searchOptions: Locator;
  readonly searchPanel: Locator;
  readonly searchRetry: Locator;
  readonly searchSubmit: Locator;

  readonly mapControls: Locator;
  readonly mapOptionsButton: Locator;
  readonly measureButton: Locator;
  readonly directionsButton: Locator;
  readonly drawButton: Locator;
  readonly locateButton: Locator;
  readonly settingsButton: Locator;
  readonly zoomControls: Locator;
  readonly zoomInButton: Locator;
  readonly zoomOutButton: Locator;
  readonly compassButton: Locator;

  readonly sheet: Locator;
  readonly sheetHeading: Locator;
  /** The sheet's h2 while Settings (Settings and Help) is the open sheet. */
  readonly settingsHeading: Locator;
  readonly sheetHandle: Locator;
  readonly sheetClose: Locator;
  readonly basemapPicker: Locator;
  readonly dropPinButton: Locator;

  readonly pinCard: Locator;
  readonly pinHeading: Locator;
  readonly pinCoordinates: Locator;
  readonly pinAddress: Locator;
  readonly pinLookupButton: Locator;
  readonly pinLookupNote: Locator;
  readonly pinLookupRetryButton: Locator;
  readonly pinAddressLoading: Locator;
  readonly pinAddressError: Locator;
  readonly pinCopyButton: Locator;
  readonly pinClearButton: Locator;
  readonly pinCopyFeedback: Locator;
  readonly pinMarker: Locator;

  readonly measureToolbar: Locator;
  readonly measureReadout: Locator;
  readonly measureAddPoint: Locator;
  readonly measureUndo: Locator;
  readonly measureClear: Locator;
  readonly measureDone: Locator;
  readonly measureOverlay: Locator;

  readonly drawToolbar: Locator;
  readonly drawStatus: Locator;
  readonly drawMeasure: Locator;
  readonly drawAddPoint: Locator;
  readonly drawUndo: Locator;
  readonly drawRedo: Locator;
  readonly drawRemove: Locator;
  readonly drawShapesButton: Locator;
  readonly drawPrimary: Locator;
  readonly drawIssue: Locator;
  readonly drawShapes: Locator;
  readonly drawHandles: Locator;
  readonly shapesSection: Locator;

  /** The decorative brand row at the top of the sheet or side panel, with its mark and name. */
  readonly sheetBrand: Locator;
  readonly brandMark: Locator;
  readonly brandName: Locator;

  readonly creditsButton: Locator;
  readonly creditsRegion: Locator;

  readonly scaleBar: Locator;
  readonly zoomLevel: Locator;
  readonly locateError: Locator;
  readonly accuracyCircle: Locator;
  readonly politeAnnouncer: Locator;
  readonly assertiveAnnouncer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.skipLink = page.getByRole("link", { name: "Skip to map" });
    this.region = page.getByRole("region", { name: "Map", exact: true });
    this.host = page.getByTestId("map-host");
    this.chrome = page.getByTestId("map-chrome");

    this.searchLandmark = page.getByRole("search", { name: "Search" });
    this.searchInput = page.getByRole("combobox", { name: "Search places" });
    this.searchClear = page.getByRole("button", { name: "Clear search" });
    this.searchList = page.getByRole("listbox", { name: "Search results" });
    this.searchOptions = this.searchList.getByRole("option");
    this.searchPanel = page.getByTestId("location-search-panel");
    this.searchRetry = page.getByTestId("location-search-retry");
    this.searchSubmit = this.searchLandmark.getByRole("button", {
      name: "Search",
      exact: true,
    });

    this.mapControls = page.getByRole("group", { name: "Map controls" });
    this.mapOptionsButton = page.getByRole("button", { name: "Map options" });
    this.measureButton = page.getByRole("button", {
      name: "Measure distance and area",
    });
    this.directionsButton = page.getByRole("button", { name: "Directions" });
    this.drawButton = page.getByRole("button", { name: "Draw shapes" });
    this.locateButton = page.getByRole("button", { name: "Locate me" });
    this.settingsButton = page.getByRole("button", {
      name: "Settings",
      exact: true,
    });
    this.zoomControls = page.getByRole("group", { name: "Zoom controls" });
    this.zoomInButton = page.getByRole("button", { name: "Zoom in" });
    this.zoomOutButton = page.getByRole("button", { name: "Zoom out" });
    this.compassButton = page.getByRole("button", {
      name: "Reset bearing to north",
    });

    this.sheet = page.getByTestId("map-options-sheet");
    this.sheetHeading = this.sheet.getByRole("heading", {
      name: "Map options",
      level: 2,
    });
    this.settingsHeading = this.sheet.getByRole("heading", {
      name: "Settings and help",
      level: 2,
    });
    this.sheetHandle = page.getByRole("button", { name: "Resize panel" });
    this.sheetClose = this.sheet.getByRole("button", {
      name: "Close",
      exact: true,
    });
    this.basemapPicker = page.getByRole("radiogroup", { name: "Basemap" });
    this.dropPinButton = page.getByRole("button", {
      name: "Drop pin at map centre",
    });

    this.pinCard = page.getByTestId("pin-card");
    this.pinHeading = page.getByRole("heading", { name: "Dropped pin" });
    this.pinCoordinates = page.getByTestId("pin-coordinates");
    this.pinAddress = page.getByTestId("pin-address");
    this.pinLookupButton = page.getByRole("button", {
      name: "Look up address",
    });
    this.pinLookupNote = page.getByTestId("pin-lookup-note");
    this.pinLookupRetryButton = page.getByRole("button", {
      name: "Try again",
    });
    this.pinAddressLoading = page.getByTestId("pin-address-loading");
    this.pinAddressError = page.getByTestId("pin-address-error");
    this.pinCopyButton = page.getByRole("button", {
      name: "Copy coordinates",
    });
    this.pinClearButton = page.getByRole("button", { name: "Clear pin" });
    this.pinCopyFeedback = page.getByTestId("pin-copy-feedback");
    this.pinMarker = page.getByTestId("pin-marker");

    this.measureToolbar = page.getByRole("toolbar", { name: "Measure" });
    this.measureReadout = page.getByTestId("measure-readout");
    this.measureAddPoint = page.getByRole("button", {
      name: "Add point at map centre",
    });
    this.measureUndo = page.getByRole("button", { name: "Undo last point" });
    this.measureClear = page.getByRole("button", { name: "Clear points" });
    this.measureDone = this.measureToolbar.getByRole("button", {
      name: "Done",
    });
    this.measureOverlay = page.getByTestId("measure-overlay");

    this.drawToolbar = page.getByRole("toolbar", { name: "Draw" });
    this.drawStatus = page.getByTestId("draw-status");
    this.drawMeasure = page.getByTestId("draw-measure");
    this.drawAddPoint = this.drawToolbar.getByTestId("draw-add-point");
    this.drawUndo = this.drawToolbar.getByRole("button", { name: "Undo" });
    this.drawRedo = this.drawToolbar.getByRole("button", { name: "Redo" });
    this.drawRemove = this.drawToolbar.getByTestId("draw-remove");
    this.drawShapesButton = this.drawToolbar.getByRole("button", {
      name: "Shapes and export",
    });
    this.drawPrimary = this.drawToolbar.getByTestId("draw-done");
    this.drawIssue = page.getByTestId("draw-issue");
    this.drawShapes = page.getByTestId("draw-shape");
    this.drawHandles = page.getByTestId("draw-handle");
    this.shapesSection = page.getByTestId("sheet-section-shapes");

    this.sheetBrand = page.getByTestId("sheet-brand");
    this.brandMark = page.getByTestId("brand-mark");
    this.brandName = page.getByTestId("brand-name");
    this.creditsButton = page.getByRole("button", { name: "Map credits" });
    this.creditsRegion = page.getByRole("region", { name: "Map credits" });

    this.scaleBar = page.locator('[data-chrome="scale-bar"]');
    this.zoomLevel = page.getByTestId("zoom-level");
    this.locateError = page.getByTestId("locate-error");
    this.accuracyCircle = page.getByTestId("accuracy-circle");
    this.politeAnnouncer = page.getByTestId("live-region-polite");
    this.assertiveAnnouncer = page.getByTestId("live-region-assertive");
  }

  /**
   * Opens the app at `/` plus an optional hash (for example
   * `#basemap=osm`) and waits until the first frame of the basemap has
   * loaded.
   */
  async goto(hash = ""): Promise<void> {
    // Going from one hash to another on the same page is not a page load, so
    // leave the app first: every goto starts the app from scratch.
    if (this.page.url().startsWith("http")) {
      await this.page.goto("about:blank");
    }
    await this.page.goto(`/${hash}`);
    await this.waitForMap();
  }

  /** Waits until the engine has mounted, reported a zoom and finished loading. */
  async waitForMap(): Promise<void> {
    await expect(this.host).toHaveAttribute("data-zoom", /\d/, {
      timeout: MAP_READY_TIMEOUT_MS,
    });
    await expect(this.host).toHaveAttribute("aria-busy", "false", {
      timeout: MAP_READY_TIMEOUT_MS,
    });
  }

  /** The normalised zoom the host reports. */
  async zoom(): Promise<number> {
    return Number(await this.host.getAttribute("data-zoom"));
  }

  /** The view in the address, or null while the address has none. */
  async hashView(): Promise<HashView | null> {
    const hash = await this.page.evaluate(() => window.location.hash);
    const match = /(?:^#|&)map=([^&]+)/.exec(hash);
    if (!match?.[1]) {
      return null;
    }
    const [zoom, lat, lng, bearing] = match[1].split("/").map(Number);
    return {
      zoom: zoom ?? Number.NaN,
      lat: lat ?? Number.NaN,
      lng: lng ?? Number.NaN,
      bearing: bearing ?? 0,
    };
  }

  /** The `basemap=` part of the address, or null. */
  async hashBasemap(): Promise<string | null> {
    const hash = await this.page.evaluate(() => window.location.hash);
    return /(?:^#|&)basemap=([^&]+)/.exec(hash)?.[1] ?? null;
  }

  /** Gives the map region keyboard focus, as the skip link or Tab would. */
  async focusMap(): Promise<void> {
    await this.region.focus();
    await expect(this.region).toBeFocused();
  }

  /** Opens the map options sheet (or side panel) from the end stack. */
  async openMapOptions(): Promise<void> {
    await this.mapOptionsButton.click();
    await expect(this.sheet).toHaveAttribute("data-state", "open");
    await expect(this.sheetHeading).toBeFocused();
  }

  /**
   * Opens the settings sheet (Settings and Help) from the end stack's
   * Settings button.
   */
  async openSettings(): Promise<void> {
    await this.settingsButton.click();
    await expect(this.sheet).toHaveAttribute("data-state", "open");
    await expect(this.settingsHeading).toBeFocused();
  }

  /**
   * Switches the open sheet to Map options with its button, without closing
   * it. Focus goes to the Basemap heading rather than the sheet's title.
   */
  async switchToMapOptions(): Promise<void> {
    await this.mapOptionsButton.click();
    await expect(this.sheetHeading).toBeVisible();
    await expect(this.mapOptionsButton).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  }

  /** Switches the open sheet to Settings with its button, without closing it. */
  async switchToSettings(): Promise<void> {
    await this.settingsButton.click();
    await expect(this.settingsHeading).toBeVisible();
    await expect(this.settingsButton).toHaveAttribute("aria-expanded", "true");
  }

  /** The current detent, or null in the side panel layout. */
  detent(): Promise<string | null> {
    return this.sheet.getAttribute("data-detent");
  }

  /** The chrome layout: `sheet` (bottom sheet) or `panel` (side panel). */
  layout(): Promise<string | null> {
    return this.chrome.getAttribute("data-layout");
  }

  /** Chooses a basemap in the open sheet by its visible name. */
  async chooseBasemap(name: string): Promise<void> {
    await this.pressBasemapTile(name);
    await expect(
      this.basemapPicker.getByRole("radio", { name, exact: true }),
    ).toBeChecked();
  }

  /**
   * Presses a basemap's tile without waiting for the choice to stick. For a
   * basemap whose provider is down: the map may already have gone back and
   * renamed its radio ("Not available right now") by the time a check runs,
   * so the caller asserts that outcome instead.
   */
  async pressBasemapTile(name: string): Promise<void> {
    // The native radio is visually hidden; a person clicks its tile (the label).
    await this.basemapPicker
      .locator("label")
      .filter({ has: this.page.getByRole("radio", { name, exact: true }) })
      .click();
  }

  /**
   * Fills the search box and presses Enter. Typing alone never searches the
   * geocoder; that search runs only when it is submitted.
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press("Enter");
  }

  /** Starts measuring and waits for the toolbar. */
  async startMeasuring(): Promise<void> {
    await this.measureButton.click();
    await expect(this.measureToolbar).toBeVisible();
  }

  /** Starts drawing and waits for the toolbar. */
  async startDrawing(): Promise<void> {
    await this.drawButton.click();
    await expect(this.drawToolbar).toBeVisible();
  }

  /**
   * Taps the map at points relative to its top-left, as a finger or a click
   * would. Each tap waits for the toolbar to say the point was added.
   */
  async tapMap(
    ...points: readonly (readonly [number, number])[]
  ): Promise<void> {
    for (const [x, y] of points) {
      await this.host.click({ position: { x, y } });
    }
  }

  /** The size of the map host, for placing taps. */
  async mapSize(): Promise<{ width: number; height: number }> {
    const box = await this.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    return { width: box.width, height: box.height };
  }

  /**
   * A long press on the map at a point relative to the map's top-left, with
   * pointer events (mouse down, hold, mouse up), as `useLongPress` sees it.
   */
  async longPress(
    x: number,
    y: number,
    holdMs = LONG_PRESS_DELAY_MS + TIMER_SLACK_MS,
  ): Promise<void> {
    const box = await this.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box to press on.");
    }
    await this.page.mouse.move(box.x + x, box.y + y);
    await this.page.mouse.down();
    await this.page.waitForTimeout(holdMs);
    await this.page.mouse.up();
  }

  /** Every message the announcer has spoken since the page loaded (see `fixtures.ts`). */
  announcements(): Promise<string[]> {
    return this.page.evaluate(() => [
      ...(window.__mapcairnAnnouncements ?? []),
    ]);
  }
}

declare global {
  interface Window {
    __mapcairnAnnouncements?: string[];
  }
}
