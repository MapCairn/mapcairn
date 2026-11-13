// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { CatalogueRefresh, CatalogueState } from "@mapcairn/core";

/** What the Layers section needs to know about the catalogue besides its layers. */
export interface CatalogueView {
  readonly status: CatalogueState["status"];
  /** How many definitions the host supplied that were left out. Zero unless `ready`. */
  readonly skipped: number;
  /** Where a refresh of the list has got to. `idle` unless `ready`. */
  readonly refresh: CatalogueRefresh;
  /** Whether the last attempt to load failed (see {@link loadFailed}), so Try again has something to do. */
  readonly failed: boolean;
  /**
   * True when the catalogue was not ready at mount, so its list arrived or
   * will arrive later and an empty one is worth saying. False for a host whose
   * layers were there from the start.
   */
  readonly awaited: boolean;
}

/** The view of a catalogue state. `awaited` is fixed at mount by the caller. */
export function catalogueView(
  state: CatalogueState,
  awaited: boolean,
): CatalogueView {
  const failed = loadFailed(state);
  return state.status === "ready"
    ? {
        status: "ready",
        skipped: state.skipped.length,
        refresh: state.refresh,
        failed,
        awaited,
      }
    : { status: state.status, skipped: 0, refresh: "idle", failed, awaited };
}

/** Whether the last attempt to load the catalogue failed, as a failed load or a failed refresh. */
export function loadFailed(state: CatalogueState): boolean {
  return (
    state.status === "failed" ||
    (state.status === "ready" && state.refresh === "failed")
  );
}

/**
 * Whether the section is left out: the catalogue is ready and has no layers,
 * and it was ready and empty from the start, so the host has none to offer.
 */
export function hidesSection(view: CatalogueView, layerCount: number): boolean {
  return view.status === "ready" && layerCount === 0 && !view.awaited;
}
