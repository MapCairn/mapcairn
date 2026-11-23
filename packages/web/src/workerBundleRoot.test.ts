// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { workerBundleRoot } from "./workerBundleRoot";

const roots: string[] = [];

function webRootWith(...folders: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "worker-bundle-root-"));
  roots.push(root);
  for (const folder of folders) {
    mkdirSync(join(root, ".cloudflare/output", folder), { recursive: true });
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("workerBundleRoot", () => {
  it("finds the bundle whatever the Build Output version folder is called", () => {
    for (const version of ["v0", "v1", "v12"]) {
      const root = webRootWith(`${version}/workers/default/bundle`);
      expect(workerBundleRoot(root)).toBe(
        join(root, `.cloudflare/output/${version}/workers/default/bundle`),
      );
    }
  });

  it("ignores a folder that holds no Worker bundle", () => {
    const root = webRootWith(
      "v1/workers/default/assets",
      "v2/workers/default/bundle",
    );
    expect(workerBundleRoot(root)).toBe(
      join(root, ".cloudflare/output/v2/workers/default/bundle"),
    );
  });

  it("returns undefined where there is no build output", () => {
    expect(workerBundleRoot(webRootWith())).toBeUndefined();
  });
});
