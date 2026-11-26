// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Why a call to `mountMap` or to a map handle could not work:
 *
 * - `server`: it ran where there is no document.
 * - `element-in-use`: the element already holds a map.
 * - `invalid-option`: an option or an argument is not usable.
 * - `layers-unavailable`: the function given as `layers` failed to load them.
 * - `destroyed`: the map was destroyed before it was ready.
 */
export type MountMapErrorKind =
  | "server"
  | "element-in-use"
  | "invalid-option"
  | "layers-unavailable"
  | "destroyed";

/**
 * What `mountMap` and a map handle throw for a call that cannot work. The
 * message says what to do about it.
 */
export class MountMapError extends Error {
  /** Which kind of failure it was. */
  readonly kind: MountMapErrorKind;

  constructor(kind: MountMapErrorKind, message: string) {
    super(message);
    this.name = "MountMapError";
    this.kind = kind;
  }
}
