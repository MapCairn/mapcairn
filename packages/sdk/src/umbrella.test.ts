// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import * as core from "@mapcairn/core";
import * as contracts from "@mapcairn/core/contracts";
import * as map from "@mapcairn/map";
import * as react from "@mapcairn/react";
import * as theme from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import * as sdkCore from "./core";
import * as sdkContracts from "./coreContracts";
import * as sdk from "./index";
import * as sdkMap from "./map";
import * as sdkReact from "./react";
import * as sdkTheme from "./theme";

/**
 * Under the source condition the umbrella is the four packages' own modules,
 * so each name it exports must be the very object the package exports. The
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

  it("resolves the two names the four packages declare twice to the packages the plan chose", () => {
    expect(sdk.ScaleBar).toBe(map.ScaleBar);
    expect(sdk.useReadingDirection).toBe(react.useReadingDirection);
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
