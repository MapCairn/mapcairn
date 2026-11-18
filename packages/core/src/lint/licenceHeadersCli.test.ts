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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/licenceHeaders.mjs",
);
const AGPL =
  "// SPDX-License-Identifier: AGPL-3.0-only\n// Copyright MapCairn contributors\n";
const APACHE =
  "// SPDX-License-Identifier: Apache-2.0\n// Copyright MapCairn contributors\n";

/**
 * These cases start Git and Node as subprocesses. Under coverage load, the
 * short-lived commands can take longer than Vitest's five-second default even
 * though they still complete. Each test shares one deadline across its
 * sequential children and keeps time for cleanup.
 */
const CHILD_TIMEOUT_MS = 30_000;
const CLEANUP_TIMEOUT_MS = 5_000;
const TEST_TIMEOUT_MS = 40_000;

describe("scripts/licenceHeaders.mjs, run as a command", {
  timeout: TEST_TIMEOUT_MS,
}, () => {
  let processDeadline = 0;
  let root: string;

  function processTimeout(): number {
    return Math.max(
      1,
      Math.min(
        CHILD_TIMEOUT_MS,
        processDeadline - Date.now() - CLEANUP_TIMEOUT_MS,
      ),
    );
  }

  function put(file: string, text: string): void {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }

  function run(...args: string[]) {
    spawnSync("git", ["add", "-A"], {
      cwd: root,
      timeout: processTimeout(),
    });
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: processTimeout(),
    });
  }

  beforeEach(() => {
    processDeadline = Date.now() + TEST_TIMEOUT_MS;
    root = mkdtempSync(path.join(tmpdir(), "mapcairn-licence-"));
    spawnSync("git", ["init", "-q"], {
      cwd: root,
      timeout: processTimeout(),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("passes when every file has the AGPL-3.0-only header", () => {
    put("packages/core/src/a.ts", `${AGPL}export {};\n`);
    put("scripts/b.mjs", `${AGPL}export {};\n`);
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("every source file has the right one");
  });

  it("fails and names a file with another licence or none", () => {
    put("packages/core/src/a.ts", `${AGPL}export {};\n`);
    put("packages/core/src/b.ts", `${APACHE}export {};\n`);
    put("scripts/c.mjs", "export {};\n");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain("packages/core/src/a.ts");
    expect(result.stderr).toContain("packages/core/src/b.ts");
    expect(result.stderr).toContain("scripts/c.mjs");
  });

  it("does not accept a header that names two licences", () => {
    put(
      "packages/core/src/a.ts",
      "// SPDX-License-Identifier: Apache-2.0 OR AGPL-3.0-only\nexport {};\n",
    );
    expect(run().status).toBe(1);
  });

  it("adds the header with --write, and leaves a wrong one alone and fails", () => {
    put("packages/core/src/new.ts", "export {};\n");
    put("packages/core/src/wrong.ts", `${APACHE}export {};\n`);
    const result = run("--write");
    expect(result.status).toBe(1);
    expect(
      readFileSync(path.join(root, "packages/core/src/new.ts"), "utf8"),
    ).toBe(`${AGPL}export {};\n`);
    expect(
      readFileSync(path.join(root, "packages/core/src/wrong.ts"), "utf8"),
    ).toBe(`${APACHE}export {};\n`);
    expect(result.stderr).toContain("name a different licence");
  });

  it("does not add a second header with --write to a file that names an expression", () => {
    const dual =
      "// SPDX-License-Identifier: Apache-2.0 OR MIT\n// Copyright MapCairn contributors\nexport {};\n";
    put("packages/core/src/dual.ts", dual);
    const result = run("--write");
    expect(
      readFileSync(path.join(root, "packages/core/src/dual.ts"), "utf8"),
    ).toBe(dual);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("name a different licence");
  });

  it("succeeds with --write when only headers were missing", () => {
    put("packages/core/src/new.ts", "export {};\n");
    expect(run("--write").status).toBe(0);
  });
});
