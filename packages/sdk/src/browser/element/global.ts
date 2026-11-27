// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapCairnMapElement } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    /** The map element: see {@link MapCairnMapElement}. */
    "mapcairn-map": MapCairnMapElement;
  }
}
