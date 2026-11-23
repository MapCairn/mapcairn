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

  it("installs the repository's own Chromium before the consumer check, which fails without it", () => {
    const install = job.indexOf(
      "run: npx --no-install playwright install --with-deps chromium",
    );
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(job.indexOf("run: npm run consumer:check"));
    expect(job.indexOf("run: npm ci --ignore-scripts")).toBeLessThan(install);
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

  it("does not run again when only the title or description is edited", () => {
    expect(job).toContain("if: github.event.action != 'edited'");
    expect(withoutComments(read(".github/workflows/ci.yml"))).toContain(
      "types: [opened, synchronize, reopened, edited]",
    );
  });

  it("keeps a description edit out of the group that cancels the run for the commit", () => {
    const workflow = withoutComments(read(".github/workflows/ci.yml"));
    const group =
      /concurrency:\n\s+group: (.+)\n\s+cancel-in-progress: true/.exec(
        workflow,
      )?.[1];
    expect(group).toBeDefined();
    expect(group).toContain("github.event.action == 'edited'");
  });

  it("is the only workflow with a required check that runs on an edit, so no other cancels a run on one", () => {
    const folder = path.join(REPO, ".github/workflows");
    const editing = readdirSync(folder).filter((file) =>
      /\bedited\b/.test(withoutComments(read(`.github/workflows/${file}`))),
    );
    // The title check reads the live title and has a concurrency group of its
    // own, so an edit cancelling its older run costs nothing; it is not a
    // required check that a cancelled run could leave missing. The description
    // check is the same: it reads the live body, has its own group and only warns.
    expect(editing).toEqual(["ci.yml", "pr-body-check.yml", "pr-title.yml"]);
  });

  describe("the step that decides whether to run", () => {
    const script = job.slice(job.indexOf("changed="));
    const filter = new RegExp(
      /grep -Eq '(.+?)' <<</.exec(job)?.[1] ?? "no filter found",
    );

    it("always runs on a push", () => {
      expect(job).toMatch(
        /if \[ "\$EVENT_NAME" != "pull_request" \]; then\n\s+echo "run=true" >> "\$GITHUB_OUTPUT"\n\s+exit 0/,
      );
    });

    it("reads the diff on its own line and greps a here-string, so a failing git or a closed pipe cannot pass it", () => {
      expect(job).toContain(
        'changed="$(git diff --name-only "origin/$BASE_REF...HEAD")"',
      );
      expect(script).toContain('<<<"$changed"');
      expect(job).not.toMatch(/git diff[^\n]*\|/);
      expect(job).not.toMatch(/\|\s*grep/);
    });

    it.each([
      "packages/core/src/index.ts",
      "packages/map/package.json",
      "packages/react/README.md",
      "packages/theme/src/tokens.css.ts",
      "scripts/release/packCheck.mjs",
      "scripts/buildPackage.mjs",
      "scripts/buildSdk.mjs",
      "scripts/entryPoint.mjs",
      "package.json",
      "package-lock.json",
      "tsconfig.base.json",
      ".npmrc",
      ".github/workflows/ci.yml",
    ])("runs for a change to %s", (file) => {
      expect(filter.test(file)).toBe(true);
    });

    it.each([
      "packages/web/src/App.tsx",
      "packages/web/package.json",
      "examples/embed/src/main.tsx",
      "sites/docs/docs/guides/public-api.md",
      "scripts/names-check.mjs",
      ".github/workflows/cla.yml",
      "README.md",
    ])("does not run for a change to %s", (file) => {
      expect(filter.test(file)).toBe(false);
    });
  });

  it("checks out the whole history, which the diff against the base needs", () => {
    expect(job).toContain("fetch-depth: 0");
  });
});

describe("the repeatable build comparison", () => {
  const workflow = withoutComments(
    read(".github/workflows/repeatable-build.yml"),
  );

  it("removes every dist folder before the second build, or it compares a build with itself", () => {
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
