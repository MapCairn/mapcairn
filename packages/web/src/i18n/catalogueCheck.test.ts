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

  it(
    "checks against a host's own English from a JSON file",
    () => {
      const english = join(folder, "english.json");
      writeFileSync(
        english,
        JSON.stringify({ "my.close": "Close", "my.open": "Open" }),
      );
      const catalogue = join(folder, "mine.json");
      writeFileSync(catalogue, JSON.stringify({ "my.close": "Close" }));
      const { status, stdout } = run("af", catalogue, "--english", english);
      expect(status).toBe(0);
      expect(stdout).toBe(
        "af: 1 missing, 1 the same as English\n\nMissing:\n  my.open\n\nThe same as English (check each: a symbol or a name kept as published can be right):\n  my.close\n",
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reads a host's English from a named export of a module",
    () => {
      const english = join(folder, "english.mjs");
      writeFileSync(
        english,
        'export const OTHER = { "x": "X" };\nexport const MY_ENGLISH = { "my.close": "Close" };\n',
      );
      const catalogue = join(folder, "mine-af.json");
      writeFileSync(catalogue, JSON.stringify({ "my.close": "Sluit" }));
      const { status, stdout } = run(
        "af",
        catalogue,
        "--english",
        english,
        "--english-export",
        "MY_ENGLISH",
      );
      expect(status).toBe(0);
      expect(stdout).toBe("af: 0 missing, 0 the same as English\n");
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    ["an array", "[]", "is a list, not an object of messages"],
    ["null", "null", "is not an object of messages"],
    [
      "a number",
      '{ "my.close": 1 }',
      'has a value for "my.close" that is not text',
    ],
  ])(
    "rejects a catalogue that is %s",
    (_, json, message) => {
      const file = join(folder, `bad-${json.length}.json`);
      writeFileSync(file, json);
      const { status, stderr } = run("af", file);
      expect(status).toBe(1);
      expect(stderr.trim()).toBe(`${file} ${message}.`);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "rejects an English reference that is not an object of text",
    () => {
      const english = join(folder, "bad-english.json");
      writeFileSync(english, '{ "my.close": ["Close"] }');
      const catalogue = join(folder, "fine.json");
      writeFileSync(catalogue, "{}");
      const { status, stderr } = run("af", catalogue, "--english", english);
      expect(status).toBe(1);
      expect(stderr.trim()).toBe(
        `${english} has a value for "my.close" that is not text.`,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "rejects a module export that is not a plain record, and reads a null-prototype one",
    () => {
      const module = join(folder, "shapes.mjs");
      writeFileSync(
        module,
        [
          'export const AS_MAP = new Map([["my.close", "Sluit"]]);',
          "export const AS_DATE = new Date(0);",
          'export const BARE = Object.assign(Object.create(null), { "my.close": "Sluit" });',
          "",
        ].join("\n"),
      );
      const english = join(folder, "close-english.json");
      writeFileSync(english, JSON.stringify({ "my.close": "Close" }));
      for (const name of ["AS_MAP", "AS_DATE"]) {
        const { status, stderr } = run(
          "af",
          module,
          name,
          "--english",
          english,
        );
        expect(status, name).toBe(1);
        expect(stderr.trim()).toBe(
          `${module} is not a plain object of messages.`,
        );
      }
      const { status, stdout } = run(
        "af",
        module,
        "BARE",
        "--english",
        english,
      );
      expect(status).toBe(0);
      expect(stdout).toBe("af: 0 missing, 0 the same as English\n");
    },
    TEST_TIMEOUT_MS,
  );

  it.each([
    [
      "an English export without an English file",
      ["--english-export", "MissingExport"],
      "--english-export needs --english.",
    ],
    [
      "an export name for a JSON catalogue",
      ["CATALOGUE"],
      "{file} is JSON, so it has no export named CATALOGUE.",
    ],
    [
      "an English export name for JSON English",
      ["--english", "{file}", "--english-export", "EN"],
      "{file} is JSON, so it has no export named EN.",
    ],
    [
      "an extra argument",
      ["CATALOGUE", "extra"],
      "Unexpected argument: extra.",
    ],
    ["an unknown option", ["--colour"], "Unknown option '--colour'."],
  ])(
    "refuses %s rather than ignore it",
    (_, extra, message) => {
      const file = join(folder, "args.json");
      writeFileSync(file, "{}");
      const args = extra.map((arg) => arg.replace("{file}", file));
      const { status, stderr } = run("af", file, ...args);
      expect(status).toBe(2);
      expect(stderr).toContain(message.replace("{file}", file));
      expect(stderr).toContain("Usage: npm run catalogue:check");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reads keys given with --not-plural as text, and --plural keys as plural",
    () => {
      const english = join(folder, "toggle-english.json");
      writeFileSync(
        english,
        JSON.stringify({
          toggle: "on|off",
          power: "on|off",
          files: "{count} file",
        }),
      );
      const catalogue = join(folder, "toggle-af.json");
      writeFileSync(
        catalogue,
        JSON.stringify({
          toggle: "on|aan",
          power: "on|aan",
          files: "{count} lêers",
        }),
      );
      const plain = run("af", catalogue, "--english", english);
      expect(plain.stdout).toMatch(/^af: 0 missing, 2 the same as English\n/);
      const listed = run(
        "af",
        catalogue,
        "--english",
        english,
        "--not-plural",
        "toggle",
        "--not-plural",
        "power",
        "--plural",
        "files",
      );
      expect(listed.status).toBe(0);
      expect(listed.stdout).toBe("af: 0 missing, 0 the same as English\n");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "refuses a --plural or --not-plural key that is not needed or is given to both",
    () => {
      const english = join(folder, "plain-english.json");
      writeFileSync(
        english,
        JSON.stringify({ close: "Close", files: "{count} file|{count} files" }),
      );
      const catalogue = join(folder, "plain-af.json");
      writeFileSync(
        catalogue,
        JSON.stringify({ close: "Sluit", files: "{count} lêer|{count} lêers" }),
      );
      const { status, stderr } = run(
        "af",
        catalogue,
        "--english",
        english,
        "--plural",
        "files",
        "--not-plural",
        "close",
        "--plural",
        "gone",
        "--not-plural",
        "gone",
      );
      expect(status).toBe(2);
      expect(stderr.trim().split("\n")).toEqual([
        "--plural files is not needed.",
        "--not-plural close is not needed.",
        "gone is given to both --plural and --not-plural.",
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "refuses a misspelt --not-plural or --plural key, naming it, rather than report a passing check",
    () => {
      const english = join(folder, "toggle-only-english.json");
      writeFileSync(english, JSON.stringify({ toggle: "on|off" }));
      const catalogue = join(folder, "toggle-only-af.json");
      writeFileSync(catalogue, JSON.stringify({ toggle: "aan|af" }));
      const { status, stdout, stderr } = run(
        "af",
        catalogue,
        "--english",
        english,
        "--not-plural",
        "toggel",
        "--plural",
        "fiels",
      );
      expect(status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr.trim().split("\n")).toEqual([
        "--plural fiels is not a key in the English catalogue.",
        "--not-plural toggel is not a key in the English catalogue.",
      ]);
    },
    TEST_TIMEOUT_MS,
  );
});
