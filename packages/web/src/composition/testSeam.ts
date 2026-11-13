// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createRuntimeLayerCatalogue,
  type LayerCatalogue,
  type Services,
} from "@mapcairn/core";
import { LAYER_DECODERS, LAYER_FORMATTERS } from "../layers";

/**
 * A unique string that appears in the build output only when this module is
 * bundled. `packages/web/scripts/verifyNoTestSeam.mjs` searches the production
 * build for it, so renaming it means updating that script.
 */
export const TEST_SEAM_MARKER = "MAPCAIRN_TEST_SEAM_MARKER";

declare global {
  interface Window {
    /**
     * A partial {@link Services} that a Playwright `addInitScript` sets before
     * the page loads. Typed `unknown` because it is outside input: it is
     * checked before use.
     */
    __MAPCAIRN_TEST_SERVICES__?: unknown;
    /**
     * A script for a catalogue that loads (see {@link ScriptedCatalogue}),
     * plain data a Playwright `addInitScript` sets before the page loads. Typed
     * `unknown` because it is outside input: it is checked before use.
     */
    __MAPCAIRN_TEST_CATALOGUE__?: unknown;
    /** The catalogue built from the script, so a test can call `refresh()` as a host would. */
    __mapcairnCatalogue?: LayerCatalogue;
  }
}

/**
 * What one load of a scripted catalogue answers: a list (of definitions, any
 * of which may be bad), `"fail"` for a request that rejects, or `"invalid"`
 * for an answer that is not a list.
 */
export type ScriptedLoad = readonly unknown[] | "fail" | "invalid";

/**
 * Plain data that scripts a runtime catalogue for a browser test, so it can
 * cross from the test into the page. Each load answers with the next of
 * `steps`, and with the last one again once they run out. `delayMs` holds each
 * answer back, so a test can look at the catalogue while it loads.
 */
export interface ScriptedCatalogue {
  readonly steps: readonly ScriptedLoad[];
  readonly delayMs: number;
}

const SERVICE_KEYS = [
  "createMapAdapter",
  "search",
  "suggestions",
  "location",
  "settings",
  "clipboard",
  "fileSaver",
  "fileOpener",
  "url",
  "theme",
  "preferences",
  "layers",
  "layerSource",
  "routing",
  "selection",
  "featureQuery",
  "basemaps",
] as const satisfies readonly (keyof Services)[];

/** Fails to compile when a `Services` key is missing from {@link SERVICE_KEYS}. */
export type ServiceKeysAreExhaustive =
  Exclude<keyof Services, (typeof SERVICE_KEYS)[number]> extends never
    ? true
    : never;

/** Whether a value is plausible for a service key: a function for the factory, an object for the rest. */
function isPlausible(key: (typeof SERVICE_KEYS)[number], value: unknown) {
  return key === "createMapAdapter"
    ? typeof value === "function"
    : typeof value === "object" && value !== null;
}

/** The services a test put on `window.__MAPCAIRN_TEST_SERVICES__` that are usable, each checked on its own. */
function acceptedServices(): Record<string, unknown> {
  const raw = window.__MAPCAIRN_TEST_SERVICES__;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const accepted: Record<string, unknown> = {};
  for (const key of SERVICE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (isPlausible(key, value)) {
      accepted[key] = value;
    }
  }
  return accepted;
}

function isScriptedLoad(value: unknown): value is ScriptedLoad {
  return Array.isArray(value) || value === "fail" || value === "invalid";
}

/** The script on the window, or undefined unless it has at least one step and every part is usable. */
function readScript(): ScriptedCatalogue | undefined {
  const raw = window.__MAPCAIRN_TEST_CATALOGUE__;
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { steps, delayMs = 0 } = raw as Record<string, unknown>;
  if (
    !Array.isArray(steps) ||
    steps.length === 0 ||
    !steps.every(isScriptedLoad) ||
    typeof delayMs !== "number" ||
    !Number.isFinite(delayMs) ||
    delayMs < 0
  ) {
    return undefined;
  }
  return { steps, delayMs };
}

/** A `load` that answers each call with the next step of the script. */
function loadFromScript(script: ScriptedCatalogue): () => Promise<unknown> {
  let calls = 0;
  return async () => {
    const step = script.steps[
      Math.min(calls, script.steps.length - 1)
    ] as ScriptedLoad;
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, script.delayMs));
    if (step === "fail") {
      throw new Error("Scripted catalogue failure.");
    }
    return step === "invalid" ? {} : step;
  };
}

/**
 * The runtime catalogue the script on `window.__MAPCAIRN_TEST_CATALOGUE__`
 * describes, built from the real one so its validation and its states are the
 * real ones, or undefined when there is no usable script. It is also put on
 * `window.__mapcairnCatalogue`, so a test can call `refresh()` as a host does.
 */
function scriptedCatalogue(): LayerCatalogue | undefined {
  const script = readScript();
  if (!script) {
    return undefined;
  }
  const catalogue = createRuntimeLayerCatalogue({
    load: loadFromScript(script),
    options: { decoders: LAYER_DECODERS, formatters: LAYER_FORMATTERS },
  });
  window.__mapcairnCatalogue = catalogue;
  return catalogue;
}

/**
 * Reads the services a browser test put on `window.__MAPCAIRN_TEST_SERVICES__`,
 * and the layer catalogue it scripted on `window.__MAPCAIRN_TEST_CATALOGUE__`.
 *
 * @remarks Never call this directly. `createServices` reaches it only through
 *   `import.meta.env.MODE !== "production"`, which the build replaces with a
 *   constant, so the call, this module and its strings are removed from a
 *   production bundle. Anything that is not a plain object is ignored, and an
 *   entry of the wrong kind (a string where a service belongs) is dropped on
 *   its own, so one bad entry cannot break the rest. A scripted catalogue
 *   stands in for `layers` unless the test supplied a `layers` service itself.
 *   Returns undefined when there is nothing usable.
 */
export function readTestOverrides(): Partial<Services> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const accepted = acceptedServices();
  const scripted = "layers" in accepted ? undefined : scriptedCatalogue();
  if (scripted) {
    accepted.layers = scripted;
  }
  const keys = Object.keys(accepted);
  if (keys.length === 0) {
    return undefined;
  }
  console.info(`${TEST_SEAM_MARKER}: test services replace ${keys.join(", ")}`);
  return accepted as Partial<Services>;
}
