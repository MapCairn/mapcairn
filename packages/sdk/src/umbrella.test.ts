// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import * as adapter from "@mapcairn/adapter-maplibre";
import * as core from "@mapcairn/core";
import * as contracts from "@mapcairn/core/contracts";
import * as map from "@mapcairn/map";
import * as react from "@mapcairn/react";
import * as theme from "@mapcairn/theme";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as sdkAdapter from "./adapterMaplibre";
import * as sdkCore from "./core";
import * as sdkContracts from "./coreContracts";
import * as sdk from "./index";
import * as sdkMap from "./map";
import * as sdkReact from "./react";
import * as sdkTheme from "./theme";

/**
 * Under the source condition the umbrella is the packages' own modules, so
 * each name it exports must be the very object the package exports. The root
 * stands for four packages; the adapter is reachable at its own subpath only. The
 * type-level collisions are checked from the API reports in
 * `packages/core/src/lint/umbrella.test.ts`, and by `tsc`.
 */

type Namespace = Readonly<Record<string, unknown>>;

const PACKAGES: Readonly<Record<string, Namespace>> = {
  core,
  map,
  react,
  theme,
};

describe("the umbrella root", () => {
  it("exports exactly the union of the four packages' names", () => {
    const union = new Set(Object.values(PACKAGES).flatMap(Object.keys));
    expect(Object.keys(sdk).sort()).toEqual([...union].sort());
  });

  it("exports each name as the package's own value", () => {
    for (const [name, namespace] of Object.entries(PACKAGES)) {
      for (const exported of Object.keys(namespace)) {
        expect(
          (sdk as Namespace)[exported],
          `${exported} from @mapcairn/${name}`,
        ).toBe(namespace[exported]);
      }
    }
  });

  it("resolves ScaleBar to the map component", () => {
    expect(sdk.ScaleBar).toBe(map.ScaleBar);
  });

  // `tsc` checks these (`npm run typecheck`): without the tie-breaks in
  // index.ts the root fails with TS2308, and with the wrong ones these differ.
  it("resolves the two names the four packages declare twice, as types, to the packages the plan chose", () => {
    expectTypeOf<sdk.ReadingDirection>().toEqualTypeOf<core.ReadingDirection>();
    expectTypeOf(sdk.ScaleBar).toEqualTypeOf(map.ScaleBar);
    // @ts-expect-error core's `ScaleBar` interface is left out of the root; it is at `@mapcairn/sdk/core`.
    expectTypeOf<sdk.ScaleBar>().toBeObject();
    expectTypeOf<sdkCore.ScaleBar>().toEqualTypeOf<core.ScaleBar>();
  });

  it("leaves out the adapter, which only its own subpath carries, so the root holds no map engine", () => {
    for (const name of Object.keys(adapter)) {
      expect(Object.keys(sdk), name).not.toContain(name);
    }
  });

  it("leaves out the contract suites, which import a test runner", () => {
    for (const name of Object.keys(contracts)) {
      expect(Object.keys(sdk), name).not.toContain(name);
    }
  });
});

describe.each([
  ["@mapcairn/sdk/core", sdkCore, core],
  ["@mapcairn/sdk/core/contracts", sdkContracts, contracts],
  ["@mapcairn/sdk/map", sdkMap, map],
  ["@mapcairn/sdk/adapter-maplibre", sdkAdapter, adapter],
  ["@mapcairn/sdk/react", sdkReact, react],
  ["@mapcairn/sdk/theme", sdkTheme, theme],
] as const)("%s", (_name, subpath, original) => {
  it("exports the same names as the package it stands for", () => {
    expect(Object.keys(subpath).sort()).toEqual(Object.keys(original).sort());
  });

  it("exports the package's own values", () => {
    for (const [name, value] of Object.entries(original)) {
      expect((subpath as Namespace)[name]).toBe(value);
    }
  });
});
