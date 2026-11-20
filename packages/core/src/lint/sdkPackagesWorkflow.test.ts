// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

function read(file: string): string {
  return readFileSync(path.join(REPO, file), "utf8");
}

/** The text of the `sdk-packages` job: from its key to the end of the file. */
function sdkPackagesJob(): string {
  const workflow = read(".github/workflows/ci.yml");
  const start = workflow.indexOf("\n  sdk-packages:\n");
  expect(start).toBeGreaterThan(-1);
  return workflow.slice(start);
}

/** The lines of a workflow with comments removed, so checks see what runs. */
function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

describe("the SDK packages job in ci.yml", () => {
  const job = withoutComments(sdkPackagesJob());

  it("is called SDK packages and runs the pack check and the consumer check", () => {
    expect(job).toContain("name: SDK packages");
    expect(job).toContain("run: npm run pack:check");
    expect(job).toContain("run: npm run consumer:check");
  });

  it("is the last job, so the text above is all of it, and no other job needs it", () => {
    const workflow = withoutComments(read(".github/workflows/ci.yml"));
    expect(workflow).not.toMatch(/needs:\s*\[?sdk-packages/);
  });

  it("reads the repository and nothing else, and does not keep the token", () => {
    expect(job).toMatch(/permissions:\n\s+contents: read/);
    expect(job).toContain("persist-credentials: false");
    expect(job).not.toMatch(/(?:write|id-token)/);
  });

  it("pins every action to a commit", () => {
    const uses = [...job.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("passes the base branch through the environment, never into a command", () => {
    expect(job).toContain("BASE_REF: ${{ github.base_ref }}");
    const commands = job
      .split("\n")
      .filter((line) => /^\s+(?:run: |elif |echo |git )/.test(line));
    expect(commands.length).toBeGreaterThan(0);
    for (const line of commands) {
      expect(line).not.toContain("${{");
    }
  });

  it("always runs on a push, and on a pull request only for the files that change the tarballs", () => {
    expect(job).toContain('"$EVENT_NAME" != "pull_request"');
    for (const filter of [
      "packages/(core|map|react|theme)/",
      "scripts/(release/|buildPackage",
      "package-lock",
      "tsconfig\\.base",
    ]) {
      expect(job).toContain(filter);
    }
  });
});

describe("the repeatable build comparison", () => {
  const workflow = withoutComments(
    read(".github/workflows/repeatable-build.yml"),
  );

  it("removes the four dist folders before the second build, or it compares a build with itself", () => {
    const rebuild = workflow.slice(workflow.indexOf("Second build from clean"));
    for (const name of ["core", "react", "theme", "map"]) {
      expect(rebuild.slice(0, rebuild.indexOf("Hash the second"))).toContain(
        `packages/${name}/dist`,
      );
    }
  });

  it.each(["first", "second"])(
    "hashes the dist folders and the packed tarballs of the %s build",
    (which) => {
      const start = workflow.indexOf(`Hash the ${which} build`);
      const step = workflow.slice(start, start + 1200);
      expect(step).toContain("packages/${package}/dist");
      expect(step).toContain("npm pack --ignore-scripts");
      expect(step).toContain(`${which}-tarballs`);
    },
  );
});

describe("the throwaway consumer", () => {
  const folder = path.join(REPO, "scripts/release/consumer");
  const files = readdirSync(folder, { recursive: true }).map(String);

  it("holds no file a test runner would pick up", () => {
    expect(files.filter((file) => /\.(test|spec)\./.test(file))).toEqual([]);
  });

  it("builds with no style plugin, as an outside app would", () => {
    for (const file of files.filter((name) =>
      /\.(tsx?|mjs|json)$/.test(name),
    )) {
      expect(readFileSync(path.join(folder, file), "utf8"), file).not.toMatch(
        /vanilla-extract|@mapcairn\/source/,
      );
    }
  });

  it("is not a workspace, so a root install never links it", () => {
    const root = JSON.parse(read("package.json")) as {
      workspaces: string[];
    };
    expect(root.workspaces.some((pattern) => pattern.includes("scripts"))).toBe(
      false,
    );
  });
});
