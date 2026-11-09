import type { ViewState } from "./geometry";

/** The data layers in a link: which are on, and their control values. */
export interface LayersUrlState {
  /** Layer ids, in the order they were turned on. */
  readonly enabled: readonly string[];
  /** Control values by layer id, then control id. Untrusted until resolved. */
  readonly controls: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** The shareable parts of the app state. Every field is optional. */
export interface UrlStateValue {
  readonly view?: ViewState;
  readonly basemapId?: string;
  readonly layers?: LayersUrlState;
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
