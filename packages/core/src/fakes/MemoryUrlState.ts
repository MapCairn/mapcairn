// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { UrlState, UrlStateValue } from "../ports/url";
import { serialiseUrlHash } from "../urlHash/urlHash";

/** The address {@link MemoryUrlState.link} puts links on. */
const MEMORY_URL_BASE = "https://mapcairn.example/";

/**
 * An in-memory {@link UrlState}.
 *
 * How to script it: pass the starting value, as if the page had loaded with
 * that address. `write` replaces the whole value (it does not merge), and
 * `writes` records every value written, in order. Nothing is debounced.
 */
export class MemoryUrlState implements UrlState {
  /** Every value passed to `write`, in order. */
  readonly writes: UrlStateValue[] = [];

  #value: UrlStateValue;

  constructor(initial: UrlStateValue = {}) {
    this.#value = initial;
  }

  /** The value last written, or the one it started with. */
  read(): UrlStateValue {
    return this.#value;
  }

  /** Replaces the whole value and records it in `writes`. It does not merge or debounce. */
  write(value: UrlStateValue): void {
    this.writes.push(value);
    this.#value = value;
  }

  /** The memory address base followed by the hash `value` makes. It has no side effect. */
  link(value: UrlStateValue): string {
    return `${MEMORY_URL_BASE}${serialiseUrlHash(value)}`;
  }
}
