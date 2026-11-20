// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";
import type { MapAdapter } from "@mapcairn/core";

// Not reached from `entryClient.tsx`, `entryServer.tsx` or `entryWorker.tsx`:
// an app that does not draw a real map does not import the adapter, and the
// check proves the umbrella's root adds none. The type check reads this file,
// so every resolution mode must find the adapter's package (and, for the
// umbrella app, the umbrella's `adapter-maplibre` subpath). `bundleGraph.mjs`
// builds it as the control that shows the module graph can see the engine.

/** The adapter as an app builds it: the host serves the engine's worker. */
export function createRealMapAdapter(): MapAdapter {
  return createMapLibreMapAdapter({
    loadWorkerUrl: async () => "/maplibre-gl-worker.mjs",
  });
}
