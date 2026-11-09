import type { UrlState, UrlStateValue } from "../ports/url";

/**
 * An in-memory {@link UrlState}.
 *
 * How to script it: pass the starting value, as if the page had loaded with
 * that address. `write` replaces the whole value (it does not merge), and
 * `writes` records every value written, in order. Nothing is debounced.
 */
export class MemoryUrlState implements UrlState {
  readonly writes: UrlStateValue[] = [];

  #value: UrlStateValue;

  constructor(initial: UrlStateValue = {}) {
    this.#value = initial;
  }

  read(): UrlStateValue {
    return this.#value;
  }

  write(value: UrlStateValue): void {
    this.writes.push(value);
    this.#value = value;
  }
}
