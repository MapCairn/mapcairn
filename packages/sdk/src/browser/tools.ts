// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MountMapError } from "./MountMapError";
import type { MountServices } from "./types";

/**
 * The optional tools `mountMap` can add to the map: `"search"` (a search box,
 * which needs `services.search`), `"basemaps"` (the sheet with the basemap
 * picker), `"layers"` (the layers in that sheet, which need `layers`),
 * `"measure"`, `"settings"` and `"locate"` (Locate me, which needs
 * `services.location`). Zoom, the compass, the credits and the scale are
 * always there.
 */
export type MapTool =
  | "search"
  | "basemaps"
  | "layers"
  | "measure"
  | "settings"
  | "locate";

/** Every {@link MapTool}, in the order the interface lists them. */
export const MAP_TOOLS: readonly MapTool[] = [
  "search",
  "basemaps",
  "layers",
  "measure",
  "settings",
  "locate",
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

function assertProviders(
  tools: ReadonlySet<MapTool>,
  provided: MountServices,
): void {
  for (const tool of tools) {
    const need = PROVIDER_NEEDS[tool];
    if (need !== undefined && provided[need.service] === undefined) {
      invalid(
        `tools: "${tool}" needs a ${need.noun} provider. Pass services.${need.service}, or remove "${tool}" from tools.`,
      );
    }
  }
}

/**
 * Checks the `tools` option against what the page supplied and returns the
 * tools to compose, none when it is left out.
 *
 * @throws MountMapError naming the fix: for an unknown tool, a tool whose
 *   provider is missing, the layers tool with no layers, and layers with no
 *   layers tool to turn them on.
 */
export function validateTools(
  tools: unknown,
  provided: MountServices,
  hasLayers: boolean,
): ReadonlySet<MapTool> {
  if (tools === undefined) {
    return new Set();
  }
  assertToolsNamed(tools);
  const chosen = new Set(tools as readonly MapTool[]);
  assertProviders(chosen, provided);
  if (chosen.has("layers") && !hasLayers) {
    invalid(
      'tools: "layers" needs layers. Pass layers, or remove "layers" from tools.',
    );
  }
  if (hasLayers && !chosen.has("layers")) {
    invalid(
      'layers can only be turned on from the "layers" tool. Add "layers" to tools, or remove layers.',
    );
  }
  return chosen;
}
