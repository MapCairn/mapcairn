// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mountMap } from "../mountMap";
import { defineElement } from "./defineElement";
import type { MapCairnMapElementClass } from "./types";

/**
 * Registers the `<mapcairn-map>` element, or one under another name. Asking
 * twice is safe: a name that is taken is left as it is. A page that loads
 * `browser-element.js` needs no call, because that file registers the element
 * itself.
 *
 * @param name - The tag name, with a hyphen in it. `"mapcairn-map"` when left out.
 * @returns The element's class, or `undefined` where there is no browser.
 * @throws MountMapError when `name` cannot name an element.
 * @example
 * ```ts
 * defineMapElement();
 * document.body.append(document.createElement("mapcairn-map"));
 * ```
 */
export function defineMapElement(
  name = "mapcairn-map",
): MapCairnMapElementClass | undefined {
  return defineElement(name, mountMap);
}
