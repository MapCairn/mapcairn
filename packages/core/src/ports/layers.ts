/** A data layer, as the ui needs to list it. */
export interface LayerSummary {
  readonly id: string;
  readonly name: string;
}

/**
 * Lists the data layers that exist. Empty in this release, so the sheet's
 * Data section renders only when a host supplies layers.
 */
export interface LayerRegistry {
  list(): readonly LayerSummary[];
}
