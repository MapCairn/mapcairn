import {
  BASEMAPS,
  formatArea,
  formatDistance,
  type LatLng,
  measureLineDistance,
  measurePolygonArea,
  type SearchProvider,
  type SearchResult,
  type ThemeChoice,
  type UnitSystem,
} from "@karta/core";
import { type MeasureMode, useSearchProvider } from "@karta/map";
import { type ModelContextToolResult, useModelContextTool } from "@karta/react";

/** The theme choices an agent may set. */
export const THEME_CHOICES: readonly ThemeChoice[] = [
  "system",
  "light",
  "dark",
];

/** Every basemap id an agent may choose, in picker order. */
export const BASEMAP_CHOICES: readonly string[] = BASEMAPS.map(
  (basemap) => basemap.id,
);

const MIN_POINTS: Readonly<Record<MeasureMode, number>> = {
  distance: 2,
  area: 3,
};

/** Wraps text as a single-block tool result. */
function textResult(text: string): ModelContextToolResult {
  return { content: [{ type: "text", text }] };
}

/** The measured total as text, or null with too few points. */
function describeTotal(
  mode: MeasureMode,
  points: readonly LatLng[],
  units: UnitSystem,
): string | null {
  // The maths takes [longitude, latitude], the reverse of LatLng.
  const positions = points.map((point) => [point.lng, point.lat]);
  if (mode === "distance") {
    const kilometres = measureLineDistance(positions);
    return kilometres === null
      ? null
      : formatDistance(kilometres * 1000, units);
  }
  const squareMetres = measurePolygonArea(positions);
  return squareMetres === null ? null : formatArea(squareMetres, units);
}

/**
 * The most places one measure tool call may name. Each is a separate lookup,
 * and the search service allows about one request a second.
 */
export const MAX_MEASURE_LOCATIONS = 10;

/**
 * Finds the best match for each place name, one after another, so the
 * lookups queue behind each other rather than arriving at the search service
 * together. Stops at the first name with no match, which saves the rest.
 * @returns The matches in the given order, or the first name with no match.
 */
export async function geocodeAll(
  provider: SearchProvider,
  names: readonly string[],
): Promise<
  { readonly found: readonly SearchResult[] } | { readonly missing: string }
> {
  const found: SearchResult[] = [];
  for (const name of names) {
    const [best] = await provider.search(name, { limit: 1 });
    if (!best) {
      return { missing: name };
    }
    found.push(best);
  }
  return { found };
}

/** Options for {@link useMapModelContextTools}: the app's own actions. */
export interface UseMapModelContextToolsOptions {
  /** Moves the map to a search result, as picking it in the search box does. */
  readonly flyTo: (result: SearchResult) => void;
  /** Stores a basemap choice, as the basemap picker does. */
  readonly chooseBasemap: (id: string) => void;
  /** Stores a theme choice, as the settings do. */
  readonly setTheme: (choice: ThemeChoice) => void;
  /** Opens the measure tool showing these points, so the person sees them. */
  readonly showMeasurement: (
    mode: MeasureMode,
    points: readonly LatLng[],
  ) => void;
  /** The units for the measured totals. */
  readonly units: UnitSystem;
}

interface SearchInput {
  readonly query: string;
}
interface BasemapInput {
  readonly basemap: string;
}
interface ThemeInput {
  readonly theme: string;
}
interface MeasureInput {
  readonly locations: readonly string[];
}

/**
 * Registers the map's actions as WebMCP tools (see `useModelContextTool`),
 * so an in-browser agent can search for a place, switch the basemap or the
 * theme, and measure along named places, through the same actions as the
 * interface. A no-op where WebMCP is unavailable.
 *
 * @remarks The layer tools of the old app are gone: there are no layers.
 *   Measuring geocodes each place with the search service, then opens the
 *   measure tool with those points, so the result is on screen as well as in
 *   the reply.
 */
export function useMapModelContextTools({
  flyTo,
  chooseBasemap,
  setTheme,
  showMeasurement,
  units,
}: UseMapModelContextToolsOptions): void {
  const provider = useSearchProvider();

  useModelContextTool<SearchInput>({
    name: "search-map-location",
    description:
      "Search for a place by name and move the map to the best match.",
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
      const [best] = await provider.search(query, { limit: 1 });
      if (!best) {
        return textResult(`No place found for "${query}".`);
      }
      flyTo(best);
      return textResult(`Moved the map to ${best.label}.`);
    },
  });

  // Offers only the built-in basemaps (`BASEMAP_CHOICES`) on purpose: a host
  // basemap such as Maptoolkit Dark comes with a provider licence, and an
  // agent should not accept a licence on a person's behalf.
  useModelContextTool<BasemapInput>({
    name: "set-map-basemap",
    description:
      "Switch the map's basemap. The basemap does not change with the theme.",
    inputSchema: {
      type: "object",
      properties: {
        basemap: {
          type: "string",
          enum: BASEMAP_CHOICES,
          description: "A basemap id.",
        },
      },
      required: ["basemap"],
      additionalProperties: false,
    },
    execute: ({ basemap }) => {
      if (!BASEMAP_CHOICES.includes(basemap)) {
        return textResult(`Unknown basemap "${basemap}".`);
      }
      chooseBasemap(basemap);
      return textResult(`Switched the basemap to ${basemap}.`);
    },
  });

  useModelContextTool<ThemeInput>({
    name: "set-app-theme",
    description: "Set the app's colour theme: system, light or dark.",
    inputSchema: {
      type: "object",
      properties: {
        theme: { type: "string", enum: THEME_CHOICES },
      },
      required: ["theme"],
      additionalProperties: false,
    },
    execute: ({ theme }) => {
      const choice = THEME_CHOICES.find((option) => option === theme);
      if (!choice) {
        return textResult(`Unknown theme "${theme}".`);
      }
      setTheme(choice);
      return textResult(`Switched the theme to ${choice}.`);
    },
  });

  const measureTool =
    (mode: MeasureMode) =>
    async ({ locations }: MeasureInput) => {
      // A browser agent may not validate the input schema, so check here too.
      if (locations.length > MAX_MEASURE_LOCATIONS) {
        return textResult(
          `Give at most ${MAX_MEASURE_LOCATIONS} places to measure.`,
        );
      }
      if (locations.length < MIN_POINTS[mode]) {
        return textResult(
          mode === "distance"
            ? "Give at least two places to measure a distance."
            : "Give at least three places to measure an area.",
        );
      }
      const result = await geocodeAll(provider, locations);
      if ("missing" in result) {
        return textResult(`No place found for "${result.missing}".`);
      }
      const points = result.found.map((found) => found.centre);
      showMeasurement(mode, points);
      const labels = result.found.map((found) => found.label);
      const total = describeTotal(mode, points, units) ?? "";
      return textResult(
        mode === "distance"
          ? `Distance along ${labels.join(" → ")}: ${total}`
          : `Area enclosed by ${labels.join(", ")}: ${total}`,
      );
    };

  useModelContextTool<MeasureInput>({
    name: "measure-distance",
    description:
      "Measure the distance along named places, in order, and show it on the map.",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          minItems: MIN_POINTS.distance,
          maxItems: MAX_MEASURE_LOCATIONS,
          description: `Place names in path order, from two to ${MAX_MEASURE_LOCATIONS}.`,
        },
      },
      required: ["locations"],
      additionalProperties: false,
    },
    execute: measureTool("distance"),
  });

  useModelContextTool<MeasureInput>({
    name: "measure-area",
    description:
      "Measure the area enclosed by named places and show it on the map.",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          minItems: MIN_POINTS.area,
          maxItems: MAX_MEASURE_LOCATIONS,
          description: `Place names in outline order, from three to ${MAX_MEASURE_LOCATIONS}.`,
        },
      },
      required: ["locations"],
      additionalProperties: false,
    },
    execute: measureTool("area"),
  });
}
