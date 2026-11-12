// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESIGN_GUIDE_MARKER } from "../designGuide/DesignGuide";
import { TEST_SEAM_MARKER } from "./testSeam";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/verifyNoTestSeam.mjs",
);

/**
 * Each case spawns Node, which a loaded machine can take a few seconds to
 * start. The child gets a bounded time of its own, and the test a little more.
 */
const CHILD_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 20_000;

/**
 * This file's own directory, created once and removed once. Every case works
 * in a fresh numbered folder inside it, so no two cases (and no other test or
 * process using the system temp folder) share a path. Windows can briefly
 * hold newly written files open, so removal retries rather than failing.
 */
let base = "";
let cases = 0;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "mapcairn-seam-"));
});

afterAll(() => {
  rmSync(base, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

/** A new, empty folder for one case. */
function caseRoot(): string {
  cases += 1;
  const root = join(base, `case-${cases}`);
  mkdirSync(root);
  return root;
}

/** Makes a fake package whose build output holds the given files. */
function fakeBuild(files: Record<string, string>): string {
  const root = caseRoot();
  mkdirSync(join(root, "build/client/assets"), { recursive: true });
  mkdirSync(join(root, "build/server"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(root, "build", path), content);
  }
  return root;
}

function run(root: string, ...flags: string[]) {
  const result = spawnSync(
    process.execPath,
    [script, "--root", root, ...flags],
    { encoding: "utf8", timeout: CHILD_TIMEOUT_MS },
  );
  if (result.error) {
    throw result.error;
  }
  return result;
}

describe("verifyNoTestSeam", { timeout: TEST_TIMEOUT_MS }, () => {
  it("passes for a build without the seam", () => {
    const root = fakeBuild({
      "client/assets/app.js": "console.log('hello')",
      "server/index.js": "export default {}",
    });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("absent");
  });

  it("fails and names the file when the marker is in the client build", () => {
    const root = fakeBuild({
      "client/assets/app.js": 'console.info("MAPCAIRN_TEST_SEAM_MARKER")',
      "server/index.js": "export default {}",
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MAPCAIRN_TEST_SEAM_MARKER");
    expect(result.stderr).toContain("app.js");
  });

  it("fails when the window property is in the server build", () => {
    const root = fakeBuild({
      "client/assets/app.js": "",
      "server/index.js": "window.__MAPCAIRN_TEST_SERVICES__",
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("__MAPCAIRN_TEST_SERVICES__");
  });

  it("looks for the markers the source defines, so a rename cannot make it pass vacuously", () => {
    const seamSource = readFileSync(
      join(dirname(script), "../src/composition/testSeam.ts"),
      "utf8",
    );
    const windowProperty = /__[A-Z]+_TEST_SERVICES__/.exec(seamSource)?.[0];
    expect(windowProperty).toBeDefined();
    for (const marker of [
      TEST_SEAM_MARKER,
      windowProperty as string,
      DESIGN_GUIDE_MARKER,
    ]) {
      const root = fakeBuild({ "client/assets/app.js": marker });
      const result = run(root);
      expect(result.status, marker).toBe(1);
      expect(result.stderr).toContain(marker);
    }
  });

  it("cannot verify, and says so, when there is no build", () => {
    const root = caseRoot();
    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Run the build first");
  });

  it("fails when the design guide marker is in the server build", () => {
    const root = fakeBuild({
      "client/assets/app.js": "",
      "server/index.js": '"data-design-guide":"MAPCAIRN_DESIGN_GUIDE_MARKER"',
    });
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MAPCAIRN_DESIGN_GUIDE_MARKER");
    expect(result.stderr).toContain("index.js");
  });

  it("with --expect-present, passes when the seam and the design guide are both there", () => {
    const root = fakeBuild({
      "client/assets/app.js": "window.__MAPCAIRN_TEST_SERVICES__",
      "client/assets/design.js": '"MAPCAIRN_DESIGN_GUIDE_MARKER"',
    });
    const result = run(root, "--expect-present");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("test seam");
    expect(result.stdout).toContain("design guide");
  });

  it("with --expect-present, fails when the seam is missing", () => {
    const root = fakeBuild({
      "client/assets/design.js": '"MAPCAIRN_DESIGN_GUIDE_MARKER"',
    });
    const result = run(root, "--expect-present");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("test seam");
  });

  it("with --expect-present, fails when the design guide is missing", () => {
    const root = fakeBuild({
      "client/assets/app.js": "window.__MAPCAIRN_TEST_SERVICES__",
    });
    const result = run(root, "--expect-present");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("design guide");
  });
});
