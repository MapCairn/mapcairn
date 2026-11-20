// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUILT_SDK_PACKAGES,
  SDK_PACKAGES,
  UMBRELLA_PACKAGE,
  UNRELEASED_SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const LIST: readonly string[] = SDK_PACKAGES;
const UNRELEASED: readonly string[] = UNRELEASED_SDK_PACKAGES;
const BUILT: readonly string[] = BUILT_SDK_PACKAGES;

interface Manifest {
  readonly name: string;
  readonly private?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

function manifestOf(folder: string): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO, "packages", folder, "package.json"), "utf8"),
  ) as Manifest;
}

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

/** A workflow's text without comment lines, so a note cannot pass for a command. */
function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** The package folders under `packages/` that are not private: what npm publishes. */
function publicWorkspaces(): string[] {
  return readdirSync(path.join(REPO, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((folder) => manifestOf(folder).private !== true);
}

describe("the list of SDK packages", () => {
  it("holds every public workspace under packages/, so a new one must be registered", () => {
    expect([...LIST].sort()).toEqual(publicWorkspaces().sort());
  });

  it("names only workspaces that exist, published under the @mapcairn scope", () => {
    for (const name of LIST) {
      expect(manifestOf(name).name).toBe(`@mapcairn/${name}`);
    }
  });

  it("lists each package once", () => {
    expect(new Set(LIST).size).toBe(LIST.length);
  });

  it("puts each package after the SDK packages it depends on, the order they build and release in", () => {
    for (const [index, name] of LIST.entries()) {
      const manifest = manifestOf(name);
      const needs = Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      })
        .filter((dependency) => dependency.startsWith("@mapcairn/"))
        .map((dependency) => dependency.slice("@mapcairn/".length))
        .filter((dependency) => LIST.includes(dependency));
      for (const need of needs) {
        expect(LIST.indexOf(need), `${name} needs ${need}`).toBeLessThan(index);
      }
    }
  });
});

describe("the list of unreleased SDK packages", () => {
  /** Every private package folder under packages/ except the reference host. */
  function privateLibraries(): string[] {
    return readdirSync(path.join(REPO, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((folder) => manifestOf(folder).private === true)
      .filter((folder) => folder !== "web");
  }

  it("holds every private library under packages/, so a new one must be registered", () => {
    expect([...UNRELEASED].sort()).toEqual(privateLibraries().sort());
  });

  it("names private workspaces under the @mapcairn scope that are not in the release set", () => {
    for (const name of UNRELEASED) {
      expect(manifestOf(name).name).toBe(`@mapcairn/${name}`);
      expect(manifestOf(name).private).toBe(true);
      expect(LIST).not.toContain(name);
    }
  });

  it("builds the release set first, then each unreleased package after the SDK packages it needs", () => {
    expect(BUILT).toEqual([...LIST, ...UNRELEASED]);
    for (const [index, name] of BUILT.entries()) {
      const manifest = manifestOf(name);
      const needs = Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      })
        .filter((dependency) => dependency.startsWith("@mapcairn/"))
        .map((dependency) => dependency.slice("@mapcairn/".length))
        .filter((dependency) => BUILT.includes(dependency));
      for (const need of needs) {
        expect(BUILT.indexOf(need), `${name} needs ${need}`).toBeLessThan(
          index,
        );
      }
    }
  });
});

describe("the umbrella package", () => {
  it("is the last of the list and depends on every other SDK package", () => {
    expect(LIST.at(-1)).toBe(UMBRELLA_PACKAGE);
    const dependencies = Object.keys(
      manifestOf(UMBRELLA_PACKAGE).dependencies ?? {},
    ).sort();
    expect(dependencies).toEqual(
      LIST.filter((name) => name !== UMBRELLA_PACKAGE)
        .map((name) => `@mapcairn/${name}`)
        .sort(),
    );
  });
});

/** The names a shell `for` loop over the SDK packages walks, from each loop in a text. */
function loopLists(text: string, variable: string): string[][] {
  return [
    ...text.matchAll(new RegExp(`for ${variable} in ([a-z -]+); do`, "g")),
  ].map((match) => (match[1] ?? "").trim().split(/\s+/));
}

describe("the workflows that name the SDK packages", () => {
  it("publish and rehearse in the order of the list", () => {
    const loops = loopLists(
      withoutComments(read(".github/workflows/release.yml")),
      "name",
    );
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      expect(loop).toEqual(LIST);
    }
  });

  it("hash and pack every package in the repeatable build, and remove every dist folder", () => {
    const workflow = withoutComments(
      read(".github/workflows/repeatable-build.yml"),
    );
    const loops = loopLists(workflow, "package");
    expect(loops).toHaveLength(4);
    for (const loop of loops) {
      expect(loop).toEqual(LIST);
    }
    const removal = workflow
      .split("\n")
      .find((line) => line.includes("rm -rf packages/web/.cloudflare"));
    expect(removal?.split(" ").filter((arg) => arg.endsWith("/dist"))).toEqual(
      LIST.map((name) => `packages/${name}/dist`),
    );
  });

  it("decide in ci.yml whether the pack check runs for a change to any SDK package folder", () => {
    const workflow = withoutComments(read(".github/workflows/ci.yml"));
    const alternation = /\^\(packages\/\(([a-z|-]+)\)\//.exec(workflow)?.[1];
    expect(alternation?.split("|").sort()).toEqual([...LIST].sort());
  });
});
