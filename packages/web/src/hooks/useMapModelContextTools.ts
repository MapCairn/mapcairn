import {
  fetchLocationSearchResults,
  formatMeasurementResult,
  getRegisteredBasemapIds,
  type LocationSearchResult,
  type MeasurementMode,
} from "@karta/map";
import type { ModelContextToolResult, ThemePreference } from "@karta/react";
import {
  setThemePreference,
  THEME_PREFERENCES,
  useModelContextTool,
} from "@karta/react";
import { getLayer, getLayers } from "../layers/registry";
import { useMapUiStore } from "../stores/useMapUiStore";

/** Wraps `text` as a single-block WebMCP tool result. */
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

interface ToggleLayerInput {
  layerId: string;
}

interface SearchLocationInput {
  query: string;
}

interface SetBasemapInput {
  basemap: string;
}

interface SetThemeInput {
  theme: string;
}

interface MeasureLocationsInput {
  locations: string[];
}

/** Single source of truth for `measure-distance`'s minimum location count, shared by its JSON Schema `minItems` and its `MeasurementToolConfig.minLocations`. */
const MEASURE_DISTANCE_MIN_LOCATIONS = 2;
/** Single source of truth for `measure-area`'s minimum location count, shared by its JSON Schema `minItems` and its `MeasurementToolConfig.minLocations`. */
const MEASURE_AREA_MIN_LOCATIONS = 3;

/** One `locations` entry from `measure-distance`/`measure-area`, geocoded to a point. */
interface ResolvedMeasurementLocation {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Geocodes every one of `locations` concurrently via
 * `fetchLocationSearchResults`, taking the best match for each.
 * @returns Every resolved point, in the same order as `locations`, or the
 *   first (in `locations`' own order, not resolution order) query that had
 *   no match; `measure-distance`/`measure-area` stop there rather than
 *   silently measuring across whichever locations did resolve.
 * @remarks Firing the lookups concurrently, rather than one at a time,
 *   avoids paying each geocode's latency serially in the common case where
 *   every location resolves; a location that has no match still costs one
 *   wasted lookup per location after it, but that only happens on the rarer
 *   failure path.
 */
async function resolveMeasurementLocations(
  locations: string[],
): Promise<
  { locations: ResolvedMeasurementLocation[] } | { notFoundQuery: string }
> {
  const bestMatchesByQuery = await Promise.all(
    locations.map(
      async (query): Promise<[string, LocationSearchResult | undefined]> => [
        query,
        (await fetchLocationSearchResults(query))[0],
      ],
    ),
  );
  const resolved: ResolvedMeasurementLocation[] = [];
  for (const [query, best] of bestMatchesByQuery) {
    if (!best) {
      return { notFoundQuery: query };
    }
    resolved.push({
      label: best.label,
      lat: best.latitude,
      lng: best.longitude,
    });
  }
  return { locations: resolved };
}

/** Config distinguishing `measure-distance` from `measure-area`'s otherwise-identical `execute` logic. */
interface MeasurementToolConfig {
  mode: MeasurementMode;
  minLocations: number;
  tooFewLocationsMessage: string;
  /** Separator joining resolved location labels into the result message's `{locations}` param, e.g. `" → "` for a path, `", "` for an outline. */
  joinSeparator: string;
  buildResultMessage: (params: { locations: string; result: string }) => string;
}

/**
 * Shared `execute` body for `measure-distance`/`measure-area`: validates the
 * minimum location count, geocodes `locations`, plots the resolved points
 * via `onRequestMeasurement`, and formats a result message.
 */
async function executeMeasurementTool(
  locations: string[],
  config: MeasurementToolConfig,
  onRequestMeasurement: UseMapModelContextToolsOptions["onRequestMeasurement"],
): Promise<ModelContextToolResult> {
  if (locations.length < config.minLocations) {
    return textResult(config.tooFewLocationsMessage);
  }
  const resolved = await resolveMeasurementLocations(locations);
  if ("notFoundQuery" in resolved) {
    return textResult(`No place found for "${resolved.notFoundQuery}".`);
  }
  const points = resolved.locations.map(({ lat, lng }) => ({ lat, lng }));
  onRequestMeasurement(config.mode, points);
  return textResult(
    config.buildResultMessage({
      locations: resolved.locations
        .map((location) => location.label)
        .join(config.joinSeparator),
      result: formatMeasurementResult(config.mode, points) ?? "",
    }),
  );
}

/** Options for `useMapModelContextTools`, covering the state that stays local to `App`. */
export interface UseMapModelContextToolsOptions {
  /**
   * Handles a location chosen for the map to fly to, mirroring
   * `LocationSearchControl`'s own `onLocationSelect` handling in `App`, and
   * returning a human-readable outcome for the calling agent.
   */
  onLocationSelect: (location: LocationSearchResult) => string;
  /**
   * Plots a measurement (a line for `"distance"`, a polygon for `"area"`)
   * through `points`, in order, on the map's own measuring tool, mirroring
   * `MapView`'s `measurementRequest` prop; so a sighted user watching the
   * screen sees what the agent just measured.
   */
  onRequestMeasurement: (
    mode: MeasurementMode,
    points: { lat: number; lng: number }[],
  ) => void;
}

/**
 * Registers this app's capabilities as WebMCP tools via `document.modelContext`
 * (see `useModelContextTool`), so an in-browser AI agent can list and toggle
 * map layers, search for a place, switch the basemap or theme,
 * and measure the distance or area across named locations;
 * without reverse-engineering the UI.
 * @remarks A no-op wherever WebMCP is unsupported; `useModelContextTool`
 *   handles that feature detection. Layer, basemap, and theme tools read and
 *   write `useMapUiStore`/the layer registry/`setThemePreference` directly
 *   rather than through props, since all three are already stable, globally
 *   reachable APIs; `onLocationSelect`/`onRequestMeasurement`
 *   stay props because they close over `App`'s own local component state
 *   (the search focus target, the panel's open/view state, the measurement
 *   request token) that isn't in the shared store. `measure-distance`/
 *   `measure-area` geocode each given location the same way
 *   `search-map-location` does (`fetchLocationSearchResults`, best match
 *   only) before handing the resolved points to `onRequestMeasurement`, so
 *   the agent's measurement shows up on the same on-screen tool a human's
 *   clicks would drive, rather than being reported as an invisible number.
 */
export function useMapModelContextTools({
  onLocationSelect,
  onRequestMeasurement,
}: UseMapModelContextToolsOptions): void {
  useModelContextTool<Record<string, never>>({
    name: "list-map-layers",
    description:
      "List this map's layers, each with its id, label, and whether it's currently visible.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: () => {
      const visibleLayerIds = useMapUiStore.getState().visibleLayerIds;
      const lines = getLayers()
        .filter((layer) => layer.available)
        .map((layer) => {
          const visibility = visibleLayerIds.includes(layer.id)
            ? "visible"
            : "hidden";
          const description = layer.description ? `: ${layer.description}` : "";
          return `${layer.id}: ${layer.label}${description} (${visibility})`;
        });
      return textResult(
        lines.length > 0
          ? lines.join("\n")
          : "This map has no layers available.",
      );
    },
  });

  useModelContextTool<ToggleLayerInput>({
    name: "toggle-map-layer",
    description:
      "Show or hide a map layer by id. Call list-map-layers first to find valid ids.",
    inputSchema: {
      type: "object",
      properties: {
        layerId: {
          type: "string",
          description: "The layer's id, as returned by list-map-layers.",
        },
      },
      required: ["layerId"],
      additionalProperties: false,
    },
    execute: ({ layerId }) => {
      const layer = getLayer(layerId);
      if (!layer) {
        return textResult(
          `No layer with id "${layerId}". Call list-map-layers to see valid ids.`,
        );
      }
      if (!layer.available) {
        return textResult(`Layer "${layer.label}" isn't available yet.`);
      }
      useMapUiStore.getState().toggleLayer(layerId);
      const nowVisible = useMapUiStore
        .getState()
        .visibleLayerIds.includes(layerId);
      return textResult(
        nowVisible
          ? `Layer "${layer.label}" is now visible.`
          : `Layer "${layer.label}" is now hidden.`,
      );
    },
  });

  useModelContextTool<SearchLocationInput>({
    name: "search-map-location",
    description:
      "Search for a place by name and fly the map to the best match.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text place name to search for.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async ({ query }) => {
      const results = await fetchLocationSearchResults(query);
      const [best] = results;
      if (!best) {
        return textResult(`No place found for "${query}".`);
      }
      return textResult(onLocationSelect(best));
    },
  });

  useModelContextTool<SetBasemapInput>({
    name: "set-map-basemap",
    description: "Switch the map's basemap.",
    inputSchema: {
      type: "object",
      properties: {
        basemap: {
          type: "string",
          enum: getRegisteredBasemapIds(),
          description: "A registered basemap id.",
        },
      },
      required: ["basemap"],
      additionalProperties: false,
    },
    execute: ({ basemap }) => {
      if (!getRegisteredBasemapIds().includes(basemap)) {
        return textResult(`Unknown basemap "${basemap}".`);
      }
      useMapUiStore.getState().setBasemap(basemap);
      return textResult(`Switched basemap to ${basemap}.`);
    },
  });

  useModelContextTool<SetThemeInput>({
    name: "set-app-theme",
    description: "Set the app's colour theme: system, light or dark.",
    inputSchema: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          enum: THEME_PREFERENCES,
        },
      },
      required: ["theme"],
      additionalProperties: false,
    },
    execute: ({ theme }) => {
      if (!THEME_PREFERENCES.includes(theme as ThemePreference)) {
        return textResult(`Unknown theme "${theme}".`);
      }
      setThemePreference(theme as ThemePreference);
      return textResult(`Switched theme to ${theme}.`);
    },
  });

  useModelContextTool<MeasureLocationsInput>({
    name: "measure-distance",
    description:
      "Measure a straight-line distance along named places and plot it on the map.",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          minItems: MEASURE_DISTANCE_MIN_LOCATIONS,
          description:
            "Place names in path order, with at least two locations.",
        },
      },
      required: ["locations"],
      additionalProperties: false,
    },
    execute: ({ locations }) =>
      executeMeasurementTool(
        locations,
        {
          mode: "distance",
          minLocations: MEASURE_DISTANCE_MIN_LOCATIONS,
          tooFewLocationsMessage:
            "Provide at least two locations to measure a distance.",
          joinSeparator: " → ",
          buildResultMessage: ({ locations, result }) =>
            `Distance along ${locations}: ${result}`,
        },
        onRequestMeasurement,
      ),
  });

  useModelContextTool<MeasureLocationsInput>({
    name: "measure-area",
    description:
      "Measure the area enclosed by named places and plot it on the map.",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          minItems: MEASURE_AREA_MIN_LOCATIONS,
          description:
            "Place names in outline order, with at least three locations.",
        },
      },
      required: ["locations"],
      additionalProperties: false,
    },
    execute: ({ locations }) =>
      executeMeasurementTool(
        locations,
        {
          mode: "area",
          minLocations: MEASURE_AREA_MIN_LOCATIONS,
          tooFewLocationsMessage:
            "Provide at least three locations to measure an area.",
          joinSeparator: ", ",
          buildResultMessage: ({ locations, result }) =>
            `Area enclosed by ${locations}: ${result}`,
        },
        onRequestMeasurement,
      ),
  });
}
