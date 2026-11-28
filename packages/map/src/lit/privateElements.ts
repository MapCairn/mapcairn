// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createLazyDefinition } from "./lazyDefinition";

/** The tag names this copy of the package defined its private elements under. */
export interface PrivateElementTags {
  readonly segmented: string;
}

/**
 * How long a map waits for the private elements before it says it could not
 * start: long enough for their one small file on a slow mobile link beside
 * everything else a first visit loads, and short enough that a request that
 * never settles does not leave the page waiting in silence.
 */
export const ELEMENTS_LOAD_TIMEOUT_MS = 30_000;

/**
 * The private elements of this copy of the package. Lit is loaded inside the
 * definition, never as this package is imported: its browser build extends
 * `HTMLElement` as it is evaluated, which a server bundle that takes the
 * `browser` condition cannot do. `MapView` loads them before it draws.
 */
export const privateElements = createLazyDefinition<PrivateElementTags>(
  async () => (await import("./elements")).definePrivateElements(),
  { timeoutMs: ELEMENTS_LOAD_TIMEOUT_MS },
);
