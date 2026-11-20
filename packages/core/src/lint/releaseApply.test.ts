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
import { afterEach, describe, expect, it } from "vitest";
import {
  applyRelease,
  parseArguments,
  ReleaseError,
  realTools,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/apply.mjs";
import {
  nestedNpmEnvironment,
  npm,
  npmInvocation,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/tools.mjs";
import {
  readSdkState,
  readWorkspaceManifests,
  setReleaseInManifest,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/workspaces.mjs";

const APPLY_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/release/apply.mjs",
);

const NOTES = `### What is new

**Selecting several features.** You can now hold Shift and click to add features to a selection. ([#49](https://github.com/MapCairn/mapcairn/pull/49))

### Thanks

Thank you to \`octo\`.
`;

const CHANGELOG = "# Changelog\n\nWhat changed in each release.\n";

const SDK = ["core", "map", "react", "theme"];
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

function git(root: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout.trim();
}

function write(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function manifest(name: string, version: string, extra: object = {}): string {
  return `${JSON.stringify({ name, version, ...extra }, null, 2)}\n`;
}

const sdkDependencies = (range: string) => ({
  "@mapcairn/core": range,
  "@mapcairn/react": range,
  "@mapcairn/theme": range,
});

/** A repository shaped like this one: four SDK packages, a host and an example. */
function repository(
  options: { versions?: Record<string, string>; changelog?: string } = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), "mapcairn-apply-"));
  folders.push(root);
  write(
    root,
    "package.json",
    manifest("mapcairn", "1.0.0", {
      private: true,
      workspaces: ["packages/*", "examples/*"],
    }),
  );
  for (const name of SDK) {
    write(
      root,
      `packages/${name}/package.json`,
      manifest(`@mapcairn/${name}`, options.versions?.[name] ?? "0.0.0", {
        dependencies:
          name === "map"
            ? { ...sdkDependencies("^0.0.0"), "left-pad": "^1.0.0" }
            : { "left-pad": "^1.0.0" },
        peerDependencies: name === "react" ? { react: "^19.0.0" } : {},
      }),
    );
  }
  write(
    root,
    "packages/web/package.json",
    manifest("@mapcairn/web", "1.0.0", {
      private: true,
      dependencies: { ...sdkDependencies("^0.0.0"), "@mapcairn/map": "^0.0.0" },
    }),
  );
  write(
    root,
    "examples/embed/package.json",
    manifest("@mapcairn/example-embed", "1.0.0", {
      private: true,
      devDependencies: { "@mapcairn/core": "^0.0.0" },
    }),
  );
  write(root, "package-lock.json", '{ "lock": 1 }\n');
  write(root, "CHANGELOG.md", options.changelog ?? CHANGELOG);
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "chore: fixture");
  return root;
}

function read(root: string, file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

function fakeTools(
  overrides: Partial<{
    ok: boolean;
    stderr: string;
    dirty: string | null;
    touchLock: boolean;
  }> = {},
) {
  const calls: string[] = [];
  return {
    calls,
    tools: {
      dirtyFiles: () => (overrides.dirty === undefined ? "" : overrides.dirty),
      install: (root: string) => {
        calls.push(root);
        if (overrides.touchLock) {
          writeFileSync(
            path.join(root, "package-lock.json"),
            '{ "lock": 2 }\n',
          );
        }
        return { ok: overrides.ok ?? true, stderr: overrides.stderr ?? "" };
      },
      today: () => "2026-12-02",
    },
  };
}

describe("setReleaseInManifest", () => {
  it("raises an SDK package's version and every internal range in every dependency block", () => {
    const text = manifest("@mapcairn/map", "0.0.0", {
      dependencies: { "@mapcairn/core": "^0.0.0", "left-pad": "^1.0.0" },
      devDependencies: { "@mapcairn/theme": "^0.0.0" },
      peerDependencies: { "@mapcairn/react": "^0.0.0" },
      optionalDependencies: { "@mapcairn/core": "^0.0.0" },
    });
    const next = JSON.parse(setReleaseInManifest(text, "0.1.0"));
    expect(next).toMatchObject({
      version: "0.1.0",
      dependencies: { "@mapcairn/core": "^0.1.0", "left-pad": "^1.0.0" },
      devDependencies: { "@mapcairn/theme": "^0.1.0" },
      peerDependencies: { "@mapcairn/react": "^0.1.0" },
      optionalDependencies: { "@mapcairn/core": "^0.1.0" },
    });
  });

  it("uses the exact version for a prerelease", () => {
    const text = manifest("@mapcairn/map", "0.0.0", {
      dependencies: { "@mapcairn/core": "^0.0.0" },
    });
    expect(
      JSON.parse(setReleaseInManifest(text, "0.1.0-rc.1")).dependencies[
        "@mapcairn/core"
      ],
    ).toBe("0.1.0-rc.1");
  });

  it("leaves a private workspace's own version alone, and keeps tab indentation and key order", () => {
    const text = JSON.stringify(
      {
        version: "1.0.0",
        name: "@mapcairn/web",
        dependencies: { "@mapcairn/core": "^0.0.0" },
      },
      null,
      "\t",
    );
    const next = setReleaseInManifest(`${text}\n`, "0.1.0");
    expect(next).toBe(`${text.replace("^0.0.0", "^0.1.0")}\n`);
  });

  it("returns an unrelated manifest as it was", () => {
    const text = manifest("left-pad", "1.0.0", {
      dependencies: { a: "^1.0.0" },
    });
    expect(setReleaseInManifest(text, "0.1.0")).toBe(text);
  });

  it("rejects something that is not a version", () => {
    expect(() => setReleaseInManifest("{}", "v1")).toThrow("not a version");
  });
});

describe("workspaces", () => {
  it("reads every workspace manifest and the shared version", () => {
    const root = repository();
    expect(
      readWorkspaceManifests(root).map((entry: { file: string }) => entry.file),
    ).toEqual([
      "packages/core/package.json",
      "packages/map/package.json",
      "packages/react/package.json",
      "packages/theme/package.json",
      "packages/web/package.json",
      "examples/embed/package.json",
    ]);
    expect(readSdkState(root)).toMatchObject({
      consistent: true,
      version: "0.0.0",
      rangeProblems: [],
    });
  });

  it("reports versions that differ, and ranges that do not match the version", () => {
    const root = repository({ versions: { theme: "0.0.1" } });
    expect(readSdkState(root)).toMatchObject({
      consistent: false,
      version: null,
    });
    const fine = repository();
    write(
      fine,
      "packages/web/package.json",
      manifest("@mapcairn/web", "1.0.0", {
        dependencies: { "@mapcairn/core": "^0.5.0" },
      }),
    );
    expect(readSdkState(fine).rangeProblems).toEqual([
      "packages/web/package.json: dependencies @mapcairn/core is ^0.5.0, expected ^0.0.0",
    ]);
  });

  it("reads a root with no workspaces and a missing folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mapcairn-empty-"));
    folders.push(root);
    write(root, "package.json", '{ "workspaces": ["packages/*", "tools"] }');
    expect(readWorkspaceManifests(root)).toEqual([]);
    write(root, "package.json", "{}");
    expect(readWorkspaceManifests(root)).toEqual([]);
  });
});

describe("applyRelease", () => {
  it("sets the four versions and every internal range in all six workspaces", () => {
    const root = repository();
    const { tools, calls } = fakeTools();
    const result = applyRelease({
      root,
      version: "0.1.0",
      notes: NOTES,
      tools,
    });
    expect(result).toMatchObject({
      version: "0.1.0",
      date: "2026-12-02",
      dryRun: false,
    });
    expect(result.files).toEqual([
      "packages/core/package.json",
      "packages/map/package.json",
      "packages/react/package.json",
      "packages/theme/package.json",
      "packages/web/package.json",
      "examples/embed/package.json",
      "CHANGELOG.md",
      "package-lock.json",
    ]);
    for (const name of SDK) {
      expect(
        JSON.parse(read(root, `packages/${name}/package.json`)).version,
      ).toBe("0.1.0");
    }
    expect(
      JSON.parse(read(root, "packages/map/package.json")).dependencies,
    ).toEqual({
      "@mapcairn/core": "^0.1.0",
      "@mapcairn/react": "^0.1.0",
      "@mapcairn/theme": "^0.1.0",
      "left-pad": "^1.0.0",
    });
    const web = JSON.parse(read(root, "packages/web/package.json"));
    expect(web.version).toBe("1.0.0");
    expect(web.dependencies["@mapcairn/map"]).toBe("^0.1.0");
    expect(
      JSON.parse(read(root, "examples/embed/package.json")).devDependencies[
        "@mapcairn/core"
      ],
    ).toBe("^0.1.0");
    expect(
      JSON.parse(read(root, "packages/react/package.json")).peerDependencies,
    ).toEqual({ react: "^19.0.0" });
    expect(readSdkState(root)).toMatchObject({
      consistent: true,
      version: "0.1.0",
      rangeProblems: [],
    });
    expect(calls).toEqual([root]);
  });

  it("uses exact internal ranges for a prerelease", () => {
    const root = repository();
    applyRelease({
      root,
      version: "0.1.0-rc.1",
      notes: NOTES,
      tools: fakeTools().tools,
    });
    expect(
      JSON.parse(read(root, "packages/web/package.json")).dependencies[
        "@mapcairn/core"
      ],
    ).toBe("0.1.0-rc.1");
  });

  it("puts the notes under the version heading, above earlier versions", () => {
    const root = repository();
    const { tools } = fakeTools();
    applyRelease({ root, version: "0.1.0", notes: NOTES, tools });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "chore(release): v0.1.0");
    applyRelease({
      root,
      version: "0.1.1",
      notes: "### What got better\n\n- Faster.\n",
      date: "2026-12-09",
      tools,
    });
    const changelog = read(root, "CHANGELOG.md");
    expect(changelog).toBe(
      `${CHANGELOG}\n## 0.1.1 (2026-12-09)\n\n### What got better\n\n- Faster.\n\n## 0.1.0 (2026-12-02)\n\n${NOTES.trim()}\n`,
    );
  });

  it("writes nothing and installs nothing on a dry run, and still checks everything", () => {
    const root = repository();
    const { tools, calls } = fakeTools();
    const result = applyRelease({
      root,
      version: "0.1.0",
      notes: NOTES,
      dryRun: true,
      tools,
    });
    expect(result.dryRun).toBe(true);
    expect(result.files).toContain("CHANGELOG.md");
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(calls).toEqual([]);
    expect(() =>
      applyRelease({
        root,
        version: "0.0.0",
        notes: NOTES,
        dryRun: true,
        tools,
      }),
    ).toThrow("not newer");
  });

  it("refuses a version that is not newer, an invalid one and an earlier prerelease", () => {
    const root = repository({
      versions: { core: "0.2.0", map: "0.2.0", react: "0.2.0", theme: "0.2.0" },
    });
    const { tools } = fakeTools();
    for (const version of ["0.2.0", "0.1.9", "0.2.0-rc.3"]) {
      expect(() =>
        applyRelease({ root, version, notes: NOTES, tools }),
      ).toThrow("not newer than the current version, 0.2.0");
    }
    expect(() =>
      applyRelease({ root, version: "v0.3.0", notes: NOTES, tools }),
    ).toThrow("not a version");
    expect(() =>
      applyRelease({ root, version: "0.3.0-rc", notes: NOTES, tools }),
    ).toThrow(ReleaseError);
  });

  it("refuses when the four versions differ", () => {
    const root = repository({ versions: { theme: "0.0.1" } });
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: NOTES,
        tools: fakeTools().tools,
      }),
    ).toThrow("do not share one version");
  });

  it("refuses a dirty tree, and a tree git cannot read", () => {
    const root = repository();
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: NOTES,
        tools: fakeTools({ dirty: " M a.txt" }).tools,
      }),
    ).toThrow("uncommitted changes");
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: NOTES,
        tools: fakeTools({ dirty: null }).tools,
      }),
    ).toThrow("could not say");
  });

  it("refuses on a real dirty tree and passes on a clean one", () => {
    const root = repository();
    expect(realTools.dirtyFiles(root)).toBe("");
    write(root, "stray.txt", "x");
    expect(realTools.dirtyFiles(root)).toContain("stray.txt");
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: NOTES,
        dryRun: true,
        tools: { ...realTools, install: fakeTools().tools.install },
      }),
    ).toThrow("uncommitted changes");
    expect(realTools.dirtyFiles(path.join(root, "missing"))).toBeNull();
  });

  it("refuses empty notes, and notes with their own version heading", () => {
    const root = repository();
    const { tools } = fakeTools();
    expect(() =>
      applyRelease({ root, version: "0.1.0", notes: "  \n", tools }),
    ).toThrow("empty");
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: `## 0.1.0 (2026-12-01)\n\n${NOTES}`,
        tools,
      }),
    ).toThrow("adds the version heading");
  });

  it("refuses notes that fail the notes check, and leaves every file alone", () => {
    const root = repository();
    const { tools, calls } = fakeTools();
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: "### What is new\n\n- feat: add a thing, thanks @someone\n",
        tools,
      }),
    ).toThrow(
      /fail the notes check:\n {2}CHANGELOG\.md:\d+: A line that starts like a commit subject/,
    );
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(calls).toEqual([]);
  });

  it("refuses a version the changelog already has, and a missing changelog", () => {
    const root = repository({
      changelog: `${CHANGELOG}\n## 0.1.0 (2026-11-01)\n\n### Thanks\n\nHi.\n`,
    });
    expect(() =>
      applyRelease({
        root,
        version: "0.1.0",
        notes: NOTES,
        tools: fakeTools().tools,
      }),
    ).toThrow("already has a section for 0.1.0");
    const bare = repository();
    rmSync(path.join(bare, "CHANGELOG.md"));
    expect(() =>
      applyRelease({
        root: bare,
        version: "0.1.0",
        notes: NOTES,
        tools: fakeTools().tools,
      }),
    ).toThrow("CHANGELOG.md does not exist");
  });

  it("puts every file back when npm install fails", () => {
    const root = repository();
    const { tools } = fakeTools({
      ok: false,
      stderr: "network down\n",
      touchLock: true,
    });
    expect(() =>
      applyRelease({ root, version: "0.1.0", notes: NOTES, tools }),
    ).toThrow(
      "npm install failed, so every file was put back as it was:\nnetwork down",
    );
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  it("restores a missing lockfile situation without writing one", () => {
    const root = repository();
    git(root, "rm", "-q", "package-lock.json");
    git(root, "commit", "-q", "-m", "chore: drop lock");
    const { tools } = fakeTools({ ok: false });
    expect(() =>
      applyRelease({ root, version: "0.1.0", notes: NOTES, tools }),
    ).toThrow(ReleaseError);
    expect(git(root, "status", "--porcelain")).toBe("");
  });
});

describe("parseArguments", () => {
  it("reads the version, the notes file and the flags in any order", () => {
    expect(parseArguments(["0.1.0", "notes.md"])).toEqual({
      version: "0.1.0",
      notesFile: "notes.md",
      dryRun: false,
      date: null,
    });
    expect(
      parseArguments([
        "--dry-run",
        "0.1.0",
        "--date",
        "2026-12-01",
        "notes.md",
      ]),
    ).toEqual({
      version: "0.1.0",
      notesFile: "notes.md",
      dryRun: true,
      date: "2026-12-01",
    });
  });

  it("rejects missing or extra arguments, an unknown option and a bad date", () => {
    for (const argv of [
      [],
      ["0.1.0"],
      ["a", "b", "c"],
      ["a", "b", "--force"],
      ["a", "b", "--date"],
      ["a", "b", "--date", "tomorrow"],
    ]) {
      expect(parseArguments(argv)).toHaveProperty("error");
    }
  });
});

describe("realTools", () => {
  it("gives today's date as YYYY-MM-DD", () => {
    expect(realTools.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("nestedNpmEnvironment", () => {
  it("drops the settings the parent npm copied into the environment and keeps the rest", () => {
    const env = nestedNpmEnvironment({
      PATH: "/bin",
      npm_config_allow_scripts: "workerd",
      npm_config_local_prefix: "/elsewhere",
      npm_package_name: "mapcairn",
      npm_lifecycle_event: "release:apply",
      npm_execpath: "/npm-cli.js",
      npm_command: "run-script",
      npm_config_registry: "https://registry.example.test/",
      NPM_CONFIG_CACHE: "/cache",
      CI: "true",
    });
    expect(env).toEqual({
      PATH: "/bin",
      npm_config_registry: "https://registry.example.test/",
      NPM_CONFIG_CACHE: "/cache",
      CI: "true",
    });
  });
});

describe("npmInvocation", () => {
  it("runs the npm that started the script, through Node, with no shell", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-npm-"));
    folders.push(folder);
    write(folder, "npm-cli.js", "");
    write(folder, "npx-cli.js", "");
    const entry = path.join(folder, "npm-cli.js");
    const npx = path.join(folder, "npx-cli.js");
    expect(npmInvocation({ npm_execpath: entry }, "/node")).toEqual({
      command: "/node",
      prefix: [entry],
    });
    expect(npmInvocation({ npm_execpath: npx }, "/node")).toEqual({
      command: "npm",
      prefix: [],
    });
  });

  it("looks beside Node when the script was not started by npm (or npx started it), and falls back to npm", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-node-"));
    folders.push(folder);
    const cli = path.join(folder, "node_modules", "npm", "bin", "npm-cli.js");
    write(folder, "node_modules/npm/bin/npm-cli.js", "");
    expect(npmInvocation({}, path.join(folder, "node"))).toEqual({
      command: path.join(folder, "node"),
      prefix: [cli],
    });
    expect(
      npmInvocation(
        { npm_execpath: path.join(folder, "missing.js") },
        path.join(folder, "node"),
      ).prefix,
    ).toEqual([cli]);
    const other = mkdtempSync(path.join(tmpdir(), "mapcairn-node-"));
    folders.push(other);
    expect(npmInvocation({}, path.join(other, "node"))).toEqual({
      command: "npm",
      prefix: [],
    });
  });

  it("runs npm", () => {
    const result = npm(["--version"], tmpdir());
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("the apply script", () => {
  function runScript(...args: string[]) {
    return spawnSync(process.execPath, [APPLY_SCRIPT, ...args], {
      encoding: "utf8",
    });
  }

  it("shows its usage on a wrong call", () => {
    const result = runScript("0.1.0");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage: release:apply");
  });

  it("reports a notes file it cannot read", () => {
    const result = runScript(
      "0.0.0",
      path.join(tmpdir(), "mapcairn-missing-notes.md"),
      "--dry-run",
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ENOENT");
  });
});

describe("applyRelease with the real npm", () => {
  it("leaves a lockfile that matches the new versions and ranges", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mapcairn-real-apply-"));
    folders.push(root);
    write(
      root,
      "package.json",
      manifest("fixture", "1.0.0", {
        private: true,
        workspaces: ["packages/*"],
      }),
    );
    write(
      root,
      "packages/core/package.json",
      manifest("@mapcairn/core", "0.0.0"),
    );
    write(
      root,
      "packages/map/package.json",
      manifest("@mapcairn/map", "0.0.0", {
        dependencies: { "@mapcairn/core": "^0.0.0" },
      }),
    );
    write(
      root,
      "packages/react/package.json",
      manifest("@mapcairn/react", "0.0.0"),
    );
    write(
      root,
      "packages/theme/package.json",
      manifest("@mapcairn/theme", "0.0.0"),
    );
    write(root, "CHANGELOG.md", CHANGELOG);
    write(root, ".gitignore", "node_modules\n");
    expect(npm(["install", "--ignore-scripts"], root).ok).toBe(true);
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "chore: fixture");

    applyRelease({ root, version: "0.1.0", notes: NOTES, date: "2026-12-01" });

    const lock = JSON.parse(read(root, "package-lock.json"));
    expect(lock.packages["packages/core"].version).toBe("0.1.0");
    expect(lock.packages["packages/map"].dependencies["@mapcairn/core"]).toBe(
      "^0.1.0",
    );
    expect(npm(["ci", "--ignore-scripts"], root).ok).toBe(true);
  }, 120_000);
});
