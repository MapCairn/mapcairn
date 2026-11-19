// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "../scripts/startE2e.mjs",
);

/** Spawning Node can take a few seconds on a loaded machine. */
const TIMEOUT_MS = 20_000;

interface Plan {
  readonly build: readonly string[];
  readonly serve: readonly string[];
}

function run(port: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (port === undefined) {
    delete env.MAPCAIRN_E2E_PORT;
  } else {
    env.MAPCAIRN_E2E_PORT = port;
  }
  const result = spawnSync(process.execPath, [script, "--print"], {
    encoding: "utf8",
    env,
    timeout: TIMEOUT_MS,
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

describe("startE2e", { timeout: TIMEOUT_MS * 2 }, () => {
  it("builds the end-to-end bundle, then serves that build on the default port", () => {
    const result = run(undefined);
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout) as Plan;
    expect(plan.build).toEqual(["npm", "run", "build:e2e"]);
    expect(plan.serve.join(" ")).toContain("--port 4173");
  });

  it("serves on the port in MAPCAIRN_E2E_PORT", () => {
    const plan = JSON.parse(run("4424").stdout) as Plan;
    expect(plan.serve.join(" ")).toContain("--port 4424");
  });

  it("serves in the end-to-end mode and fails instead of moving to another port", () => {
    const { serve } = JSON.parse(run("4424").stdout) as Plan;
    expect(serve.join(" ")).toContain("--mode e2e");
    expect(serve).toContain("--strictPort");
  });

  it("never starts Wrangler", () => {
    const { build, serve } = JSON.parse(run("4424").stdout) as Plan;
    expect([...build, ...serve].join(" ")).not.toMatch(/wrangler/i);
  });

  it("refuses a port that is not a number", () => {
    const result = run("abc");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MAPCAIRN_E2E_PORT must be a port number");
  });
});
