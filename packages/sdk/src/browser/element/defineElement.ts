// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { MountMapError } from "../MountMapError";
import { createElementClass, ELEMENT_MARKER } from "./createElementClass";
import type { ElementMount, MapCairnMapElementClass } from "./types";

/** The names this accepts: lower case, starting with a letter, with a hyphen in it. */
const ELEMENT_NAME = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;

/** The names the platform keeps for itself, which no custom element may take. */
const RESERVED_NAMES = [
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
];

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
  if (RESERVED_NAMES.includes(name)) {
    throw new MountMapError(
      "invalid-option",
      `"${name}" is a reserved name that no element may take. Use another, for example "my-map".`,
    );
  }
  const existing = customElements.get(name);
  if (existing !== undefined) {
    if (!Reflect.has(existing, ELEMENT_MARKER)) {
      throw new MountMapError(
        "invalid-option",
        `"${name}" is already used by another element. Pass a different name to defineMapElement, for example "my-map".`,
      );
    }
    return existing as MapCairnMapElementClass;
  }
  const created = createElementClass(mountMap);
  customElements.define(name, created);
  return created;
}
