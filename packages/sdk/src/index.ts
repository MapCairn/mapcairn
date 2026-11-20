// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

export type { ReadingDirection } from "@mapcairn/core";
/**
 * The whole SDK from one import: every export of `@mapcairn/core`,
 * `@mapcairn/map`, `@mapcairn/react` and `@mapcairn/theme`.
 *
 * Two names are declared by more than one of those packages. The explicit
 * exports below decide them: `ScaleBar` is the component from
 * `@mapcairn/map` (`@mapcairn/core` declares the measurement as a type of the
 * same name, reachable from `@mapcairn/sdk/core`), and `ReadingDirection` is
 * the type from `@mapcairn/core`, which `@mapcairn/react` declares again with
 * the same members. A new collision fails `tsc` until it gets a line here.
 *
 * The contract suites in `@mapcairn/core/contracts` import a test runner and
 * are reachable only from `@mapcairn/sdk/core/contracts`.
 */
export * from "@mapcairn/core";
export * from "@mapcairn/map";
export { ScaleBar } from "@mapcairn/map";
export * from "@mapcairn/react";
export * from "@mapcairn/theme";
