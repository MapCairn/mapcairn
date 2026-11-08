import type { TownshipFeature } from "@karta/app";
import {
  fetchFeatureCollection,
  mergeFeatureCollections,
  partitionSettled,
} from "@karta/core";
import { useAbortController } from "@karta/map";
import type { Feature } from "geojson";
import { useEffect, useState } from "react";
import { fetchTownships } from "../data/fetchTownships";
import { buildRegionDataUrls } from "../data/regionDataUrls";

/** State and actions for the deferred, cross-region township datasets. */
export interface TownshipDataState {
  townships: TownshipFeature[];
  townshipAreas: Feature[];
  dataError: boolean;
  retry: () => void;
}

/**
 * Loads township and outline data only when the map is ready and a choropleth
 * layer is enabled, keeping the initial basemap lightweight.
 */
export function useTownshipData(
  mapReady: boolean,
  enabled: boolean,
): TownshipDataState {
  const [townships, setTownships] = useState<TownshipFeature[]>([]);
  const [townshipAreas, setTownshipAreas] = useState<Feature[]>([]);
  const [dataError, setDataError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { next: nextFetchSignal, abort: abortFetch } = useAbortController();

  useEffect(() => {
    if (!mapReady || !enabled) {
      if (!enabled) {
        setDataError(false);
        setTownships([]);
        setTownshipAreas([]);
      }
      return;
    }
    let cancelled = false;
    const signal = nextFetchSignal();
    setDataError(false);
    setTownships([]);
    setTownshipAreas([]);
    const cacheBust = loadAttempt > 0 ? `?retry=${loadAttempt}` : "";
    const townshipUrls = buildRegionDataUrls(
      `townships.display.v1.geojson${cacheBust}`,
    );
    const areaUrls = buildRegionDataUrls(
      `township-areas.display.v1.geojson${cacheBust}`,
    );

    Promise.all([
      Promise.allSettled(
        townshipUrls.map((url) => fetchTownships(url, signal)),
      ),
      Promise.allSettled(
        areaUrls.map((url) => fetchFeatureCollection(url, undefined, signal)),
      ),
    ]).then(([townshipResults, areaResults]) => {
      if (cancelled) {
        return;
      }
      const townshipData = partitionSettled(townshipResults);
      const areaData = partitionSettled(areaResults);
      if (townshipData.fulfilled.length === 0) {
        setDataError(true);
        return;
      }
      for (const reason of [...townshipData.rejected, ...areaData.rejected]) {
        console.error("Failed to load region map data", reason);
      }
      setTownships(townshipData.fulfilled.flat());
      setTownshipAreas(mergeFeatureCollections(areaData.fulfilled).features);
    });
    return () => {
      cancelled = true;
      abortFetch();
    };
  }, [loadAttempt, mapReady, enabled, nextFetchSignal, abortFetch]);

  return {
    townships,
    townshipAreas,
    dataError,
    retry: () => setLoadAttempt((attempt) => attempt + 1),
  };
}
