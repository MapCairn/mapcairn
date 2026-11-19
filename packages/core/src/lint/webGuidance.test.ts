// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  childEnvironment,
  isAllowedCommand,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/web-guidance.mjs";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/agents/web-guidance.mjs",
);
const CHILD_TIMEOUT_MS = 60_000;

describe("isAllowedCommand", () => {
  it.each(["search", "list", "retrieve"])("allows %s", (command) => {
    expect(isAllowedCommand(command)).toBe(true);
  });

  it.each([
    "install",
    "update",
    "uninstall",
    "legacy-scan",
    "set-allow-origin-trials",
    "set-allow-volatile-features",
    "--help",
    "",
    undefined,
  ])("refuses %s", (command) => {
    expect(isAllowedCommand(command)).toBe(false);
  });
});

describe("childEnvironment", () => {
  it("turns telemetry off, whatever the parent environment says", () => {
    expect(childEnvironment({ DISABLE_TELEMETRY: "0" }).DISABLE_TELEMETRY).toBe(
      "1",
    );
    expect(childEnvironment({}).DISABLE_TELEMETRY).toBe("1");
  });

  it("keeps the rest of the environment and does not change its input", () => {
    const parent = { PATH: "/bin", HOME: "/home/someone" };
    const child = childEnvironment(parent);
    expect(child.PATH).toBe("/bin");
    expect(child.HOME).toBe("/home/someone");
    expect(parent).not.toHaveProperty("DISABLE_TELEMETRY");
  });
});

describe("scripts/agents/web-guidance.mjs, run as a command", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
    });

  it.each([["install"], ["update"], ["uninstall"], ["legacy-scan", "."], []])(
    "exits 2 and runs nothing for %j",
    (...args) => {
      const result = run(...args);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(
        "usage: node scripts/agents/web-guidance.mjs",
      );
      expect(result.stdout).toBe("");
    },
  );

  it("searches the packaged guides and prints JSON ids", () => {
    const result = run("search", "light dismiss dialog");
    expect(result.status).toBe(0);
    const hits = JSON.parse(result.stdout) as { id: string }[];
    expect(hits.map((hit) => hit.id)).toContain("light-dismiss-a-dialog");
  });

  it("retrieves a guide by id", () => {
    const result = run("retrieve", "light-dismiss-a-dialog");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("closedby");
  });
});
