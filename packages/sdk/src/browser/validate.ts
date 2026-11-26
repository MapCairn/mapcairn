// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  BUILT_IN_BASEMAP_CATALOGUE,
  createBasemapCatalogue,
  type ThemeChoice,
  type ViewState,
} from "@mapcairn/core";
import { type BuiltLanguages, buildLanguages } from "./languages";
import { MountMapError } from "./MountMapError";
import { type MapTool, validateTools } from "./tools";
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
  readonly tools: ReadonlySet<MapTool>;
  readonly languages: BuiltLanguages;
}

function invalid(message: string): never {
  throw new MountMapError("invalid-option", message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Throws a `MountMapError` naming what is wrong with a centre. */
function assertCenter(center: unknown, name: string): void {
  const candidate = center as Partial<ViewState["center"]> | null | undefined;
  if (
    !candidate ||
    !isFiniteNumber(candidate.lat) ||
    Math.abs(candidate.lat) > MAX_LATITUDE
  ) {
    invalid(`${name}.center.lat must be a number from -90 to 90.`);
  }
  if (
    !isFiniteNumber(candidate.lng) ||
    Math.abs(candidate.lng) > MAX_LONGITUDE
  ) {
    invalid(`${name}.center.lng must be a number from -360 to 360.`);
  }
}

function assertZoom(zoom: unknown, name: string): void {
  if (!isFiniteNumber(zoom)) {
    invalid(`${name}.zoom must be a number.`);
  }
}

function assertBearing(bearing: unknown, name: string): void {
  if (!isFiniteNumber(bearing) || bearing < 0 || bearing >= FULL_TURN) {
    invalid(`${name}.bearing must be a number from 0 to under 360.`);
  }
}

/** Throws a `MountMapError` naming the first thing wrong with a view. */
export function assertView(
  view: unknown,
  name: string,
): asserts view is ViewState {
  const candidate = view as Partial<ViewState> | null | undefined;
  assertCenter(candidate?.center, name);
  assertZoom(candidate?.zoom, name);
  assertBearing(candidate?.bearing, name);
}

/**
 * Throws a `MountMapError` naming the first thing wrong with the fields a
 * partial view holds. A field that is left out is not checked.
 */
export function assertPartialView(view: unknown, name: string): void {
  if (typeof view !== "object" || view === null) {
    invalid(`${name} must be an object such as { zoom: 5 }.`);
  }
  const candidate = view as Partial<ViewState>;
  if ("center" in candidate) {
    assertCenter(candidate.center, name);
  }
  if ("zoom" in candidate) {
    assertZoom(candidate.zoom, name);
  }
  if ("bearing" in candidate) {
    assertBearing(candidate.bearing, name);
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
    tools: validateTools(options.tools, options.services ?? {}),
    languages: buildLanguages(options.languages, options.language),
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
      "workerUrl must be on this page's origin. Serve the worker file from your own site, or leave workerUrl out.",
    );
  }
  return url.href;
}
