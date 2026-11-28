// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createLazyDefinition } from "./lazyDefinition";

/** The tag names this copy of the package defined its private elements under. */
export interface PrivateElementTags {
  readonly segmented: string;
}

/**
 * The private elements of this copy of the package. Lit is loaded inside the
 * definition, never as this package is imported: its browser build extends
 * `HTMLElement` as it is evaluated, which a server bundle that takes the
 * `browser` condition cannot do. `MapView` loads them before it draws.
 */
export const privateElements = createLazyDefinition<PrivateElementTags>(
  async () => (await import("./elements")).definePrivateElements(),
);
