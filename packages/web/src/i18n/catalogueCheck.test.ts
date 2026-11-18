// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EN_GB_CATALOGUE } from "@mapcairn/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(packageRoot, "scripts/catalogueCheck.mjs");

/**
 * Each case spawns Node with tsx, which a loaded machine can take a few
 * seconds to start. The child gets a bounded time of its own, and the test a
 * little more.
 */
const CHILD_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 40_000;

let folder = "";

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "mapcairn-catalogue-"));
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true, maxRetries: 10 });
});

/** Runs the command as npm would from this package, with `args`. */
function run(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: packageRoot,
    env: { ...process.env, INIT_CWD: packageRoot },
    encoding: "utf8",
    timeout: CHILD_TIMEOUT_MS,
  });
}

describe("the catalogue:check command", () => {
  it(
    "lists the keys a JSON catalogue is missing and the ones left as English",
    () => {
      const file = join(folder, "partial.json");
      writeFileSync(
        file,
        JSON.stringify({
          "settings.title": EN_GB_CATALOGUE["settings.title"],
          "settings.theme.label": "Tema",
        }),
      );
      const { status, stdout } = run("af", file);
      expect(status).toBe(0);
      const missing = Object.keys(EN_GB_CATALOGUE).length - 2;
      const [summary, ...rest] = stdout.split("\n\n");
      expect(summary).toBe(`af: ${missing} missing, 1 the same as English`);
      const [missingList, copiedList] = rest;
      expect(missingList).toContain("\n  settings.units.label");
      expect(missingList).not.toContain("settings.theme.label");
      expect(copiedList?.split("\n").slice(1)).toEqual([
        "  settings.title",
        "",
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reads a TypeScript module's only export, relative to where npm ran",
    () => {
      const { status, stdout } = run("af", "src/i18n/af.ts");
      expect(status).toBe(0);
      expect(stdout).toMatch(/^af: 0 missing, \d+ the same as English\n/);
      expect(stdout).not.toContain("Missing:");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "names the module's exports when the one asked for is not there",
    () => {
      const { status, stderr } = run("af", "src/i18n/af.ts", "FR_CATALOGUE");
      expect(status).toBe(1);
      expect(stderr).toContain(
        "has no export named FR_CATALOGUE; its exports are AF_CATALOGUE.",
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "explains its usage and fails without a language and a file",
    () => {
      const { status, stderr } = run("af");
      expect(status).toBe(2);
      expect(stderr).toContain("npm run catalogue:check -- <language> <file>");
    },
    TEST_TIMEOUT_MS,
  );
});
