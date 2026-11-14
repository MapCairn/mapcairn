// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ViewState } from "./geometry";

/** The data layers in a link: which are on, and their control values. */
export interface LayersUrlState {
  /** Layer ids, in the order they were turned on. */
  readonly enabled: readonly string[];
  /** Control values by layer id, then control id. Untrusted until resolved. */
  readonly controls: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * How many distinct readable ids a link carried past the limit on layers
   * (the first ones are kept), so the interface can say they were left out.
   * Set only when an address is read and left out when it is zero. It is never
   * written to an address.
   */
  readonly dropped?: number;
}

/** The shareable parts of the app state. Every field is optional. */
export interface UrlStateValue {
  readonly view?: ViewState;
  readonly basemapId?: string;
  readonly layers?: LayersUrlState;
  /**
   * Drawn shapes in the compact link encoding (`encodeShapes`). Untrusted
   * until decoded. The app never writes it to the address bar: it is read
   * from a link someone shared, and written only into the link that
   * {@link UrlState.link} builds when the person chooses to share shapes.
   */
  readonly shapes?: string;
}

/**
 * Reads and writes the shareable state in the page address, using the hash
 * and `history.replaceState` only, so history is never spammed. Writes are
 * debounced inside the real adapter. Parsing and serialising live in core.
 */
export interface UrlState {
  read(): UrlStateValue;
  write(value: UrlStateValue): void;
  /**
   * The full address that would show `value`: this page's address with its
   * hash replaced by the one `value` makes. It changes nothing, so a link can
   * carry more than the address bar does.
   */
  link(value: UrlStateValue): string;
}
