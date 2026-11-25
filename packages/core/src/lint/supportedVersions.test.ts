// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  oldestReactVersions,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/consumerLegs.mjs";
import {
  SDK_PACKAGES,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/sdkPackages.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

interface Manifest {
  readonly engines?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

function manifest(file: string): Manifest {
  return JSON.parse(readFileSync(path.join(REPO, file), "utf8")) as Manifest;
}

const GUIDE = readFileSync(
  path.join(REPO, "sites/docs/docs/guides/supported-versions.md"),
  "utf8",
);

/** Every range one peer name carries across the six SDK packages. */
function peerRanges(name: string): string[] {
  return (SDK_PACKAGES as string[])
    .map(
      (pkg) =>
        manifest(`packages/${pkg}/package.json`).peerDependencies?.[name],
    )
    .filter((range): range is string => range !== undefined);
}

describe("the supported versions guide", () => {
  it("states the one React range every SDK package accepts", () => {
    const ranges = [...peerRanges("react"), ...peerRanges("react-dom")];
    expect(ranges.length).toBeGreaterThan(0);
    expect(new Set(ranges).size).toBe(1);
    expect(GUIDE).toContain(`\`react\` and \`react-dom\` \`${ranges[0]}\``);
  });

  it("states the MapLibre range the adapter and the umbrella require", () => {
    const ranges = peerRanges("maplibre-gl");
    expect(new Set(ranges).size).toBe(1);
    expect(GUIDE).toContain(`\`maplibre-gl\` \`${ranges[0]}\``);
  });

  it("states the Node and npm the repository requires", () => {
    const { engines } = manifest("package.json");
    expect(GUIDE).toContain(`Node \`${engines?.node}\``);
    expect(GUIDE).toContain(`npm \`${engines?.npm}\``);
  });
});

describe("oldestReactVersions", () => {
  const versions = { react: "19.3.1", "react-dom": "19.3.1", vite: "8.0.0" };

  it("pins React and React DOM to the lowest version the peer range allows", () => {
    expect(oldestReactVersions(versions, "^19.0.0")).toEqual({
      ...versions,
      react: "19.0.0",
      "react-dom": "19.0.0",
    });
  });

  it("refuses a range it cannot read the lowest version of", () => {
    expect(() => oldestReactVersions(versions, ">=19")).toThrow(/peer range/);
  });

  it("is the lowest version the SDK packages' peer range names", () => {
    const [range] = peerRanges("react");
    expect(oldestReactVersions(versions, range).react).toBe(
      range.replace("^", ""),
    );
  });
});
