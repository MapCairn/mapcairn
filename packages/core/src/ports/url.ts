import type { ViewState } from "./geometry";

/** The shareable parts of the app state. Every field is optional. */
export interface UrlStateValue {
  readonly view?: ViewState;
  readonly basemapId?: string;
}

/**
 * Reads and writes the shareable state in the page address, using the hash
 * and `history.replaceState` only, so history is never spammed. Writes are
 * debounced inside the real adapter. Parsing and serialising live in core.
 */
export interface UrlState {
  read(): UrlStateValue;
  write(value: UrlStateValue): void;
}
