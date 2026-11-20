// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  describeFindings,
  FORBIDDEN_NPM_COMMANDS,
  forbiddenCommandOf,
  forbiddenInScript,
  forbiddenInShellText,
  isExecutable,
  jobRanges,
  scanRepository,
  scanSources,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** Spawning git can be slow while coverage runs in parallel. */
const CHILD_TIMEOUT_MS = 30_000;

/** Commands found in a line of shell. */
function inShell(text: string): string[] {
  return forbiddenInShellText(text);
}

/** Commands found in JavaScript source. */
function inScript(source: string): string[] {
  return forbiddenInScript(source).map(
    (finding: { command: string }) => finding.command,
  );
}

describe("forbiddenInShellText", () => {
  it.each([
    ["plain", "npm publish", "publish"],
    ["with options", "npm publish --dry-run --tag next", "publish"],
    ["after a workspace option", "npm -w packages/core publish", "publish"],
    [
      "after a workspace option with =",
      "npm --workspace=core publish",
      "publish",
    ],
    ["staged", "npm stage publish ./core.tgz --tag latest", "stage"],
    ["approving", "npm stage approve", "stage"],
    ["through npx", "npx -y npm publish", "publish"],
    ["through npx with a version", "npx --yes npm@11 publish", "publish"],
    ["through corepack", "corepack npm publish", "publish"],
    [
      "through node and npm-cli.js",
      "node ./node_modules/npm/bin/npm-cli.js publish",
      "publish",
    ],
    [
      "through the npm_execpath variable",
      'node "$npm_execpath" publish',
      "publish",
    ],
    [
      "through the variable in braces",
      "node ${npm_execpath} publish",
      "publish",
    ],
    [
      "through the variable in Windows form",
      "node %npm_execpath% publish",
      "publish",
    ],
    ["with the executable name on Windows", "npm.cmd publish", "publish"],
    ["with a quoted program and command", '"npm" "publish"', "publish"],
    ["after && in a chain", "npm run build && npm publish", "publish"],
    ["after a semicolon", "echo done; npm publish", "publish"],
    ["after a pipe", "echo y | npm publish", "publish"],
    ["after a line continuation", "npm \\\n  publish", "publish"],
    ["through pnpm", "pnpm publish", "publish"],
    ["through yarn", "yarn npm publish", "publish"],
    ["through lerna", "lerna publish", "publish"],
    ["a name npm shortens", "npm pub", "publish"],
    ["login", "npm login", "login"],
    ["adduser, an alias of login", "npm adduser", "login"],
    ["add-user, an alias of login", "npm add-user", "login"],
    ["trust", "npm trust github @mapcairn/core", "trust"],
    ["dist-tag", "npm dist-tag add @mapcairn/core@1.0.0 latest", "dist-tag"],
    ["dist-tags, an alias", "npm dist-tags ls", "dist-tag"],
    ["unpublish", "npm unpublish @mapcairn/core@1.0.0", "unpublish"],
    ["deprecate", 'npm deprecate @mapcairn/core "old"', "deprecate"],
    ["access", "npm access grant read-only", "access"],
    ["owner", "npm owner add someone @mapcairn/core", "owner"],
    ["author, an alias of owner", "npm author ls", "owner"],
    ["token", "npm token create", "token"],
    ["team", "npm team create mapcairn:agents", "team"],
    [
      "an option this check does not know",
      "npm --made-up-option value publish",
      "publish",
    ],
    [
      "approving a deployment",
      "gh api repos/MapCairn/mapcairn/actions/runs/1/pending_deployments -X POST",
      "pending_deployments",
    ],
  ])("finds %s", (_name, line, command) => {
    expect(inShell(line)).toContain(command);
  });

  it.each([
    "npm install",
    "npm ci --ignore-scripts",
    "npm run build",
    "npm run publish:docs",
    "npm run publish",
    "npm test -- publish",
    "npm pack --dry-run --json",
    "npm view @mapcairn/core version",
    "npm help publish",
    "npm install team",
    "npm add left-pad",
    "npm logout",
    "npm whoami",
    "npm audit signatures",
    "npm exec -- vitest run access",
    "npx --no-install vitest run",
    "echo publish the notes",
    "gh pr view 482",
    "gh api repos/MapCairn/mapcairn/pulls",
    "gh workflow run release.yml -f mode=rehearse",
    "git push origin main",
  ])("leaves %s alone", (line) => {
    expect(inShell(line)).toEqual([]);
  });
});

describe("forbiddenInScript", () => {
  it.each([
    ["a string", 'run("npm publish");'],
    ["a single-quoted string", "run('npm publish --tag next');"],
    ["a template literal", "run(`npm publish ${tarball}`);"],
    ["a template literal through npx", "run(`npx -y npm publish`);"],
    ["an array after the program", 'run("npm", ["publish", "--dry-run"]);'],
    ["a staged array", 'run("npm", ["stage", "publish", tarball]);'],
    ["an array passed to a helper named for npm", 'npm(["publish"]);'],
    ["an array passed to runNpm", 'runNpm(["publish"], { cwd });'],
    [
      "an array passed to runNpm after another argument",
      'runNpm(cwd, ["trust", "github"]);',
    ],
    [
      "an array of spawnSync",
      'spawnSync("npm", ["dist-tag", "add", spec, "latest"]);',
    ],
    [
      "an array with the program inside",
      'spawnSync(process.execPath, [npmCliPath(), "publish"]);',
    ],
    [
      "an array with the program as a name",
      'execFileSync(npmBinary, ["publish"]);',
    ],
    [
      "an array with options first",
      'run("npm", ["-w", "packages/core", "publish"]);',
    ],
    ["an array through npx", 'run("npx", ["-y", "npm", "publish"]);'],
    ["an array through corepack", 'run("corepack", ["npm", "publish"]);'],
    [
      "an array built apart from its call",
      'const args = ["publish", "--access", "public"];',
    ],
    ["an array of access", 'run("npm", ["access", "grant"]);'],
    ["an array of token", 'npm(["token", "revoke", id]);'],
    ["string arguments", 'run("npm", "publish");'],
    [
      "the env variable of npm",
      'spawnSync(process.env.npm_execpath, ["publish"]);',
    ],
    [
      "a deployment approval",
      'gh(["api", "repos/x/y/actions/runs/1/pending_deployments"]);',
    ],
    ["a shortened name", 'run("npm", ["pub"]);'],
  ])("finds %s", (_name, source) => {
    expect(inScript(source).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "a comment",
      '// run("npm", ["publish"]) is what the maintainer does\nconst x = 1;',
    ],
    ["a block comment", "/* npm publish */ const x = 1;"],
    ["a words list", 'const WORDS = ["access", "owner", "token", "team"];'],
    ["a GitHub API field list", 'const fields = ["owner", "repo", "login"];'],
    ["npm install", 'run("npm", ["ci", "--ignore-scripts"]);'],
    ["npm pack", 'npm(["pack", "--dry-run", "--json"]);'],
    ["npm view of a package named team", 'npm(["view", "team", "version"]);'],
    ["npm run publish:docs", 'run("npm", ["run", "publish:docs"]);'],
    [
      "a message about the release",
      'console.log("Published the notes to the pull request");',
    ],
    ["gh", 'run("gh", ["release", "view", tag]);'],
    [
      "a string that holds a quote",
      'const pattern = /\'/; const kept = "npm install";',
    ],
  ])("leaves %s alone", (_name, source) => {
    expect(inScript(source)).toEqual([]);
  });

  it("does not guard against a command built at run time", () => {
    // Out of scope and said so in the guard's header: the review covers it.
    expect(inScript('run("npm", ["pub" + "lish"]);')).toEqual([]);
  });
});

describe("forbiddenCommandOf", () => {
  it("knows every command and alias, and the starts of them npm accepts", () => {
    expect(forbiddenCommandOf("publish")).toBe("publish");
    expect(forbiddenCommandOf("PUBLISH")).toBe("publish");
    expect(forbiddenCommandOf("publi")).toBe("publish");
    expect(forbiddenCommandOf("adduser")).toBe("login");
    expect(forbiddenCommandOf("author")).toBe("owner");
    expect(forbiddenCommandOf("dist-tags")).toBe("dist-tag");
  });

  it("leaves other commands and words alone", () => {
    expect(forbiddenCommandOf("pack")).toBeUndefined();
    expect(forbiddenCommandOf("add")).toBeUndefined();
    expect(forbiddenCommandOf("pu")).toBeUndefined();
    expect(forbiddenCommandOf("install")).toBeUndefined();
  });

  it("lists the commands the maintainer decided on", () => {
    expect(FORBIDDEN_NPM_COMMANDS).toEqual([
      "publish",
      "stage",
      "login",
      "trust",
      "dist-tag",
      "unpublish",
      "deprecate",
      "access",
      "owner",
      "token",
      "team",
    ]);
  });
});

describe("scanSources", () => {
  const scan = (file: string, text: string) =>
    scanSources([{ path: file, text }]) as {
      file: string;
      line: number;
      command: string;
    }[];

  it("fails on a package.json script, with its line", () => {
    const manifest = JSON.stringify(
      {
        name: "x",
        scripts: { build: "tsc", release: "npm run build && npm publish" },
      },
      null,
      2,
    );
    expect(scan("package.json", manifest)).toEqual([
      { file: "package.json", line: 5, command: "publish" },
    ]);
  });

  it("fails on a script of a workspace manifest", () => {
    const manifest = JSON.stringify({
      scripts: { prepublishOnly: "npm publish" },
    });
    expect(scan("packages/core/package.json", manifest)).toHaveLength(1);
  });

  it("reads only the scripts of a manifest", () => {
    const manifest = JSON.stringify({
      description: "run npm publish",
      scripts: { build: "tsc" },
    });
    expect(scan("package.json", manifest)).toEqual([]);
  });

  it("fails on a file under scripts/ and packages/<name>/scripts/", () => {
    const source =
      'import { run } from "./tools.mjs";\nrun("npm", ["publish"]);\n';
    expect(scan("scripts/release/ship.mjs", source)).toEqual([
      { file: "scripts/release/ship.mjs", line: 2, command: "publish" },
    ]);
    expect(scan("packages/core/scripts/ship.mjs", source)).toHaveLength(1);
  });

  it("fails on a shell script under scripts/", () => {
    expect(scan("scripts/ship.sh", "#!/bin/sh\nnpm publish\n")).toHaveLength(1);
  });

  it("fails on a lefthook command", () => {
    const hooks = "pre-push:\n  commands:\n    ship:\n      run: npm publish\n";
    expect(scan("lefthook.yml", hooks)).toEqual([
      { file: "lefthook.yml", line: 4, command: "publish" },
    ]);
  });

  it("fails on a workflow step", () => {
    const workflow = [
      "jobs:",
      "  build:",
      "    steps:",
      "      - run: npm ci",
      "      - run: npm publish",
      "",
    ].join("\n");
    expect(scan(".github/workflows/ci.yml", workflow)).toHaveLength(1);
  });

  it("fails on a step in a multi-line run block and a composite action", () => {
    const block =
      "jobs:\n  a:\n    steps:\n      - run: |\n          npm ci\n          npx -y npm publish\n";
    expect(scan(".github/workflows/other.yml", block)).toHaveLength(1);
    expect(
      scan(
        ".github/actions/ship/action.yml",
        "runs:\n  steps:\n    - run: npm publish\n",
      ),
    ).toHaveLength(1);
  });

  it("fails on a Dockerfile and a Makefile", () => {
    expect(scan("Dockerfile", "RUN npm publish\n")).toHaveLength(1);
    expect(scan("docker/Dockerfile.release", "RUN npm publish\n")).toHaveLength(
      1,
    );
    expect(scan("Makefile", "ship:\n\tnpm publish\n")).toHaveLength(1);
  });

  it("fails on approving a deployment from a workflow", () => {
    const workflow =
      "jobs:\n  a:\n    steps:\n      - run: gh api repos/x/y/actions/runs/1/pending_deployments\n";
    expect(scan(".github/workflows/ci.yml", workflow)).toHaveLength(1);
  });

  it("ignores a comment in a workflow", () => {
    const workflow =
      "jobs:\n  a:\n    steps:\n      # npm publish happens in release.yml\n      - run: npm ci # not npm publish\n";
    expect(scan(".github/workflows/ci.yml", workflow)).toEqual([]);
  });

  it("allows stage and publish in the npm job of release.yml, and nothing else there", () => {
    const workflow = [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - run: npm ci",
      "  npm:",
      "    environment: npm",
      "    steps:",
      "      - run: npm stage publish ./core.tgz --tag latest",
      "      - run: npm dist-tag add @mapcairn/core@1.0.0 latest",
      "  github-release:",
      "    steps:",
      "      - run: npm stage publish ./core.tgz",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([
      { file: ".github/workflows/release.yml", line: 9, command: "dist-tag" },
      { file: ".github/workflows/release.yml", line: 12, command: "stage" },
    ]);
  });

  it("allows nothing in release.yml when it has no npm job", () => {
    const workflow = "jobs:\n  other:\n    steps:\n      - run: npm publish\n";
    expect(scan(".github/workflows/release.yml", workflow)).toHaveLength(1);
  });

  it("allows nothing in another workflow, even in a job named npm", () => {
    const workflow = "jobs:\n  npm:\n    steps:\n      - run: npm publish\n";
    expect(scan(".github/workflows/ci.yml", workflow)).toHaveLength(1);
  });

  it("does not read prose, the guard or its tests", () => {
    expect(scan("AGENTS.md", "Never run npm publish.")).toEqual([]);
    expect(
      scan("docs/guides/releasing.md", "npm dist-tag add x latest"),
    ).toEqual([]);
    expect(scan(".claude/skills/release/SKILL.md", "npm publish")).toEqual([]);
    expect(
      scan("scripts/release/publishGuard.mjs", 'run("npm publish")'),
    ).toEqual([]);
    expect(
      scan("packages/core/src/lint/publishGuard.test.ts", 'run("npm publish")'),
    ).toEqual([]);
  });

  it("reads executable files and nothing else", () => {
    expect(isExecutable("scripts/release/plan.mjs")).toBe(true);
    expect(isExecutable("lefthook.yml")).toBe(true);
    expect(isExecutable(".github/workflows/ci.yml")).toBe(true);
    expect(isExecutable("packages/web/package.json")).toBe(true);
    expect(isExecutable("packages/web/src/app/App.tsx")).toBe(false);
    expect(isExecutable("docs/plans/0014-sdk-release.md")).toBe(false);
  });

  it("describes a finding with its place and the command", () => {
    const [line] = describeFindings([
      { file: "a.yml", line: 3, command: "publish" },
    ]);
    expect(line).toContain("a.yml:3");
    expect(line).toContain("publish");
  });
});

describe("jobRanges", () => {
  it("finds each job by its two-space key", () => {
    const text =
      "name: x\njobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: y\nother: 1\n";
    expect([...jobRanges(text)]).toEqual([
      ["a", { start: 3, end: 4 }],
      ["b", { start: 5, end: 6 }],
    ]);
  });

  it("finds none without a jobs section", () => {
    expect(jobRanges("name: x\n").size).toBe(0);
  });
});

describe("the repository", () => {
  it("holds no forbidden command in a file that executes", () => {
    const findings = scanRepository(REPO) as unknown[];
    expect(describeFindings(findings)).toEqual([]);
  });

  it("is run by npm run lint and by the pre-commit hook", async () => {
    const { readFileSync } = await import("node:fs");
    const manifest = JSON.parse(
      readFileSync(path.join(REPO, "package.json"), "utf8"),
    );
    expect(manifest.scripts.lint).toContain("publish:guard");
    expect(manifest.scripts["publish:guard"]).toBe(
      "node scripts/release/publishGuard.mjs",
    );
    expect(readFileSync(path.join(REPO, "lefthook.yml"), "utf8")).toContain(
      "npm run publish:guard",
    );
  });
});

describe("the command line", () => {
  it(
    "exits 1 and names the place when a file would publish",
    () => {
      const root = mkdtempSync(path.join(tmpdir(), "publish-guard-"));
      try {
        spawnSync("git", ["init", "-q"], { cwd: root });
        mkdirSync(path.join(root, "scripts"));
        writeFileSync(
          path.join(root, "scripts", "ship.mjs"),
          'run("npm", ["publish"]);\n',
        );
        const result = spawnSync(
          process.execPath,
          [path.join(REPO, "scripts/release/publishGuard.mjs"), root],
          { encoding: "utf8" },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("scripts/ship.mjs:1");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    CHILD_TIMEOUT_MS,
  );

  it(
    "exits 0 on a clean folder",
    () => {
      const root = mkdtempSync(path.join(tmpdir(), "publish-guard-"));
      try {
        spawnSync("git", ["init", "-q"], { cwd: root });
        writeFileSync(
          path.join(root, "package.json"),
          '{"scripts":{"build":"tsc"}}\n',
        );
        const result = spawnSync(
          process.execPath,
          [path.join(REPO, "scripts/release/publishGuard.mjs"), root],
          { encoding: "utf8" },
        );
        expect(result.status).toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    CHILD_TIMEOUT_MS,
  );
});
