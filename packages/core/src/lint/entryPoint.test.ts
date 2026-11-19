// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const HELPER = pathToFileURL(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../scripts/entryPoint.mjs",
  ),
).href;

/** Spawning Node can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A folder holding a script that prints whether it is the entry point. */
function probeFolder(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-entry-"));
  folders.push(folder);
  mkdirSync(path.join(folder, "real"));
  writeFileSync(
    path.join(folder, "real", "probe.mjs"),
    `import { isEntryPoint } from ${JSON.stringify(HELPER)};\nconsole.log(isEntryPoint(import.meta.url));\n`,
  );
  return folder;
}

function run(script: string): string {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    timeout: CHILD_TIMEOUT_MS,
  });
  expect(result.stderr).toBe("");
  return result.stdout.trim();
}

describe("isEntryPoint", () => {
  it("is true for the script node was started with", () => {
    const folder = probeFolder();
    expect(run(path.join(folder, "real", "probe.mjs"))).toBe("true");
  });

  it("is true when the script is reached through a link to its folder", () => {
    const folder = probeFolder();
    // A junction needs no privilege on Windows; on other systems it is a plain link.
    symlinkSync(
      path.join(folder, "real"),
      path.join(folder, "link"),
      "junction",
    );
    expect(run(path.join(folder, "link", "probe.mjs"))).toBe("true");
  });

  it("is false for a module that was imported", () => {
    const folder = probeFolder();
    writeFileSync(
      path.join(folder, "real", "main.mjs"),
      'import "./probe.mjs";\n',
    );
    expect(run(path.join(folder, "real", "main.mjs"))).toBe("false");
  });
});
