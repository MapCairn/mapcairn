// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  BUILT_IN_BASEMAP_CATALOGUE,
  createBasemapCatalogue,
  type ThemeChoice,
  type ViewState,
} from "@mapcairn/core";
import { MountMapError } from "./MountMapError";
import type { MountMapOptions } from "./types";

/** The view of the whole world a map starts on when it is given none. */
export const WORLD_VIEW: ViewState = Object.freeze({
  center: Object.freeze({ lat: 20, lng: 0 }),
  zoom: 2,
  bearing: 0,
});

const THEMES: readonly ThemeChoice[] = ["light", "dark", "system"];
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 360;
const FULL_TURN = 360;

/** What `mountMap` works from once its options are known to be usable. */
export interface ValidOptions {
  readonly view: ViewState;
  readonly basemaps: BasemapCatalogue;
  readonly basemapId: string | null;
  readonly theme: ThemeChoice;
  readonly label: string | undefined;
}

function invalid(message: string): never {
  throw new MountMapError("invalid-option", message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Throws a `MountMapError` naming the first thing wrong with a view. */
export function assertView(
  view: unknown,
  name: string,
): asserts view is ViewState {
  const candidate = view as Partial<ViewState> | null | undefined;
  const { center } = candidate ?? {};
  if (
    !center ||
    !isFiniteNumber(center.lat) ||
    Math.abs(center.lat) > MAX_LATITUDE
  ) {
    invalid(`${name}.center.lat must be a number from -90 to 90.`);
  }
  if (!isFiniteNumber(center.lng) || Math.abs(center.lng) > MAX_LONGITUDE) {
    invalid(`${name}.center.lng must be a number from -360 to 360.`);
  }
  if (!isFiniteNumber(candidate?.zoom)) {
    invalid(`${name}.zoom must be a number.`);
  }
  if (
    !isFiniteNumber(candidate?.bearing) ||
    candidate.bearing < 0 ||
    candidate.bearing >= FULL_TURN
  ) {
    invalid(`${name}.bearing must be a number from 0 to under 360.`);
  }
}

/** Throws a `MountMapError` unless the value is a theme choice. */
export function assertTheme(theme: unknown): asserts theme is ThemeChoice {
  if (!THEMES.includes(theme as ThemeChoice)) {
    invalid('theme must be "light", "dark" or "system".');
  }
}

/** Throws a `MountMapError` unless the id names a basemap of the catalogue. */
export function assertBasemap(catalogue: BasemapCatalogue, id: unknown): void {
  if (typeof id !== "string" || catalogue.get(id) === undefined) {
    const known = catalogue.basemaps.map((basemap) => basemap.id).join(", ");
    invalid(`basemap "${String(id)}" is not offered. Use one of: ${known}.`);
  }
}

function catalogueFor(basemaps: MountMapOptions["basemaps"]): BasemapCatalogue {
  if (basemaps === undefined) {
    return BUILT_IN_BASEMAP_CATALOGUE;
  }
  try {
    return createBasemapCatalogue(basemaps);
  } catch (error) {
    return invalid(
      `basemaps: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Checks the options and fills in what was left out.
 *
 * @throws MountMapError naming the option and how to fix it.
 */
export function validateOptions(options: MountMapOptions): ValidOptions {
  if (typeof options !== "object" || options === null) {
    invalid("The options must be an object, or left out.");
  }
  const view = options.view ?? WORLD_VIEW;
  assertView(view, "view");
  const theme = options.theme ?? "system";
  assertTheme(theme);
  if (options.label !== undefined && typeof options.label !== "string") {
    invalid("label must be text.");
  }
  const basemaps = catalogueFor(options.basemaps);
  if (options.basemap !== undefined) {
    assertBasemap(basemaps, options.basemap);
  }
  return {
    view,
    basemaps,
    basemapId: options.basemap ?? null,
    theme,
    label: options.label === "" ? undefined : options.label,
  };
}

/**
 * The absolute address of the engine's worker, which must be on the page's
 * origin, because a worker from another origin cannot start. A `blob:` address
 * counts as the origin that made it, which `URL` reports as its `origin`.
 *
 * @throws MountMapError when it is on another origin or is not an address.
 */
export function sameOriginWorkerUrl(candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate, document.baseURI);
  } catch {
    return invalid(
      "workerUrl must be an address, such as /mapcairn/browser-worker.js.",
    );
  }
  if (url.origin !== new URL(document.URL).origin) {
    invalid(
      "workerUrl must be on this page's origin. Serve the browser files from your own site.",
    );
  }
  return url.href;
}
