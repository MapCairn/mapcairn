// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MountMapError } from "../MountMapError";
import { createElementClass } from "./createElementClass";
import type { ElementMount, MapCairnMapElementClass } from "./types";

/** The names this accepts: lower case, starting with a letter, with a hyphen in it. */
const ELEMENT_NAME = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;

/**
 * Registers the element under `name`, over a function that draws a map, unless
 * the name is taken. Where there is no browser it does nothing.
 *
 * @returns The class registered under `name`, or `undefined` with no browser.
 * @throws MountMapError when `name` is not lower case with a hyphen in it.
 */
export function defineElement(
  name: string,
  mountMap: ElementMount,
): MapCairnMapElementClass | undefined {
  if (
    typeof HTMLElement === "undefined" ||
    typeof customElements === "undefined"
  ) {
    return undefined;
  }
  if (!ELEMENT_NAME.test(name)) {
    throw new MountMapError(
      "invalid-option",
      `"${name}" cannot be an element name. Use lower case letters and digits with a hyphen in the middle, for example "my-map".`,
    );
  }
  const existing = customElements.get(name);
  if (existing !== undefined) {
    return existing as MapCairnMapElementClass;
  }
  const created = createElementClass(mountMap);
  customElements.define(name, created);
  return created;
}
