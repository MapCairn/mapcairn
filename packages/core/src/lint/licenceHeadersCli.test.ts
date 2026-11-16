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

describe("scripts/licenceHeaders.mjs, run as a command", () => {
  let root: string;

  function put(file: string, text: string): void {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }

  function run(...args: string[]) {
    spawnSync("git", ["add", "-A"], { cwd: root });
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
    });
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "mapcairn-licence-"));
    spawnSync("git", ["init", "-q"], { cwd: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("passes when every file has the identifier for its package", () => {
    put("packages/core/src/a.ts", `${AGPL}export {};\n`);
    put("packages/geolint/src/a.ts", `${APACHE}export {};\n`);
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("every source file has the right one");
  });

  it("fails and names a file with the wrong licence, in either direction", () => {
    put("packages/geolint/src/a.ts", `${AGPL}export {};\n`);
    put("packages/core/src/b.ts", `${APACHE}export {};\n`);
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("packages/geolint/src/a.ts");
    expect(result.stderr).toContain("packages/core/src/b.ts");
  });

  it("does not accept a header that names two licences", () => {
    put(
      "packages/geolint/src/a.ts",
      "// SPDX-License-Identifier: Apache-2.0 OR AGPL-3.0-only\nexport {};\n",
    );
    expect(run().status).toBe(1);
  });

  it("adds the right header with --write, and leaves a wrong one alone and fails", () => {
    put("packages/geolint/src/new.ts", "export {};\n");
    put("packages/core/src/new.ts", "export {};\n");
    put("packages/geolint/src/wrong.ts", `${AGPL}export {};\n`);
    const result = run("--write");
    expect(result.status).toBe(1);
    expect(
      readFileSync(path.join(root, "packages/geolint/src/new.ts"), "utf8"),
    ).toBe(`${APACHE}export {};\n`);
    expect(
      readFileSync(path.join(root, "packages/core/src/new.ts"), "utf8"),
    ).toBe(`${AGPL}export {};\n`);
    expect(
      readFileSync(path.join(root, "packages/geolint/src/wrong.ts"), "utf8"),
    ).toBe(`${AGPL}export {};\n`);
    expect(result.stderr).toContain("name a different licence");
  });

  it("does not add a second header with --write to a file that names an expression", () => {
    const dual =
      "// SPDX-License-Identifier: Apache-2.0 OR MIT\n// Copyright MapCairn contributors\nexport {};\n";
    put("packages/geolint/src/dual.ts", dual);
    const result = run("--write");
    expect(
      readFileSync(path.join(root, "packages/geolint/src/dual.ts"), "utf8"),
    ).toBe(dual);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("name a different licence");
  });

  it("succeeds with --write when only headers were missing", () => {
    put("packages/geolint/src/new.ts", "export {};\n");
    expect(run("--write").status).toBe(0);
  });
});
