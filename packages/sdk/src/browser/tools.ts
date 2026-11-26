// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MountMapError } from "./MountMapError";
import type { MountServices } from "./types";

/**
 * The optional tools `mountMap` can add to the map: `"search"` (a search box,
 * which needs `services.search`), `"map-options"` (the sheet with the
 * basemaps, a pin and saving the map as an image, and the layers when `layers`
 * is given), `"measure"`, `"locate"` (Locate me, which needs
 * `services.location`) and `"settings"`. Zoom, the compass, the credits and the
 * scale are always there.
 */
export type MapTool =
  | "search"
  | "map-options"
  | "measure"
  | "locate"
  | "settings";

/** Every {@link MapTool}, in the order the interface lists them. */
export const MAP_TOOLS: readonly MapTool[] = [
  "search",
  "map-options",
  "measure",
  "locate",
  "settings",
];

/** The provider a tool cannot work without, as the page names it and as a person reads it. */
interface ProviderNeed {
  readonly service: keyof MountServices;
  readonly noun: string;
}

const PROVIDER_NEEDS: Readonly<Partial<Record<MapTool, ProviderNeed>>> = {
  search: { service: "search", noun: "search" },
  locate: { service: "location", noun: "location" },
};

function invalid(message: string): never {
  throw new MountMapError("invalid-option", message);
}

function isTool(name: unknown): name is MapTool {
  return MAP_TOOLS.includes(name as MapTool);
}

function assertToolsNamed(tools: unknown): asserts tools is readonly unknown[] {
  if (!Array.isArray(tools)) {
    invalid(
      'tools must be a list of tool names, for example ["measure", "settings"].',
    );
  }
  for (const name of tools) {
    if (!isTool(name)) {
      const known = MAP_TOOLS.map((tool) => `"${tool}"`).join(", ");
      invalid(`tools: "${String(name)}" is not a tool. Use any of: ${known}.`);
    }
  }
}

/**
 * The tools that can work with what the page gave. A tool whose provider is
 * missing is left out with one warning that names the fix, instead of
 * throwing, so a framework that sets the providers after the map connects is
 * never stuck.
 */
function withProviders(
  tools: ReadonlySet<MapTool>,
  provided: MountServices,
): ReadonlySet<MapTool> {
  const working = new Set(tools);
  for (const tool of tools) {
    const need = PROVIDER_NEEDS[tool];
    if (need !== undefined && provided[need.service] === undefined) {
      working.delete(tool);
      console.warn(
        `tools: "${tool}" needs a ${need.noun} provider, so it is not shown. Pass services.${need.service}, or remove "${tool}" from tools.`,
      );
    }
  }
  return working;
}

/**
 * Checks the `tools` option and returns the tools to compose, none when it is
 * left out.
 *
 * @throws MountMapError naming the fix for a tools value that is not a list of
 *   tool names. A tool whose provider is missing is not an error: it is left
 *   out, with a warning.
 */
export function validateTools(
  tools: unknown,
  provided: MountServices,
): ReadonlySet<MapTool> {
  if (tools === undefined) {
    return new Set();
  }
  assertToolsNamed(tools);
  return withProviders(new Set(tools as readonly MapTool[]), provided);
}
