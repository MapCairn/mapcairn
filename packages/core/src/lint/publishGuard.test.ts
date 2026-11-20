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
import { describe, expect, it } from "vitest";
import {
  describeFindings,
  EXEMPT_FILES,
  FORBIDDEN_NPM_COMMANDS,
  forbiddenCommandOf,
  forbiddenInScript,
  forbiddenInShellText,
  isExecutable,
  jobRanges,
  publishesOnlyDryRuns,
  scanRepository,
  scanSources,
  stripShellComment,
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
      "profile, which can turn off two-factor",
      "npm profile disable-2fa",
      "profile",
    ],
    ["org", "npm org set mapcairn someone owner", "org"],
    ["ogr, a typo npm accepts for org", "npm ogr ls mapcairn", "org"],
    ["undeprecate", "npm undeprecate @mapcairn/core@1.0.0", "undeprecate"],
    ["pnpm publish", "pnpm publish --no-git-checks", "publish"],
    ["yarn publish", "yarn publish", "publish"],
    ["bun publish", "bun publish", "publish"],
    ["an env prefix", "CI=1 npm publish", "publish"],
    ["tabs between the words", "npm\tpublish", "publish"],
    ["npx with a latest tag", "npx npm@latest publish", "publish"],
    ["a command after a quoted hash", 'echo " #" && npm publish', "publish"],
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
    [
      "approving a deployment through GraphQL",
      "gh api graphql -f query='mutation { approveDeployments(input: {}) { clientMutationId } }'",
      "approveDeployments",
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
    "npm hook ls",
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
      "profile",
      "org",
      "undeprecate",
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

  it("allows publish in the npm job of release.yml, and nothing else there", () => {
    const workflow = [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - run: npm ci",
      "  npm:",
      "    environment: npm",
      "    steps:",
      "      - run: npm publish ./core.tgz --tag latest --provenance",
      "      - run: npm dist-tag add @mapcairn/core@1.0.0 latest",
      "      - run: npm stage publish ./core.tgz --tag latest",
      "  github-release:",
      "    steps:",
      "      - run: npm publish ./core.tgz",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([
      { file: ".github/workflows/release.yml", line: 9, command: "dist-tag" },
      { file: ".github/workflows/release.yml", line: 10, command: "stage" },
      { file: ".github/workflows/release.yml", line: 13, command: "publish" },
    ]);
  });

  it("allows only a dry run in the rehearse job of release.yml", () => {
    const workflow = [
      "jobs:",
      "  rehearse:",
      "    steps:",
      "      - run: npm publish ./core.tgz --provenance --dry-run",
      "      - run: npm publish ./core.tgz --provenance",
      "      - run: npm stage publish ./core.tgz --dry-run",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([
      { file: ".github/workflows/release.yml", line: 5, command: "publish" },
      { file: ".github/workflows/release.yml", line: 6, command: "stage" },
    ]);
    expect(scan(".github/workflows/ci.yml", workflow)).toHaveLength(3);
  });

  it.each([
    ["an option that only starts with it", "npm publish ./c.tgz --dry-run-not"],
    ["the option set to false", "npm publish ./c.tgz --dry-run=false"],
    ["the option set to true", "npm publish ./c.tgz --dry-run=true"],
    [
      "the option set again to false",
      "npm publish ./c.tgz --dry-run --dry-run=false",
    ],
    ["the option negated", "npm publish ./c.tgz --dry-run --no-dry-run"],
    ["it in a comment", "npm publish ./c.tgz # --dry-run"],
    [
      "it in another command after a semicolon",
      "npm publish ./c.tgz; echo --dry-run",
    ],
    ["it in another command after &&", "npm publish ./c.tgz && echo --dry-run"],
    [
      "it before the publish, in another command",
      "echo --dry-run && npm publish ./c.tgz",
    ],
    ["it before the command word", "npm --dry-run publish ./c.tgz"],
    ["it as the package after --", "npm publish -- --dry-run"],
    ["it inside a quoted package", 'npm publish "./c.tgz --dry-run"'],
    ["it after an escaped space", "npm publish ./a.tgz x\\ --dry-run"],
    ["it before a closing quote", "npm publish ./c.tgz --dry-run'"],
    ["a quote left open", 'npm publish "./c.tgz --dry-run'],
    [
      "the option followed by a false value",
      "npm publish ./c.tgz --dry-run false",
    ],
    [
      "the option followed by another word",
      "npm publish ./c.tgz --dry-run --tag next",
    ],
    ["the option followed by a word", "npm publish ./c.tgz --dry-run x"],
  ])("does not take %s for a dry run in the rehearse job", (_name, command) => {
    const workflow = `jobs:\n  rehearse:\n    steps:\n      - run: ${command}\n`;
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([
      { file: ".github/workflows/release.yml", line: 4, command: "publish" },
    ]);
  });

  it.each([
    ["a blank line", ["", "          echo --dry-run"]],
    ["a more-indented line", ["            echo --dry-run"]],
  ])(
    "keeps the line break of a folded block at %s as a command separator",
    (_name, rest) => {
      const workflow = [
        "jobs:",
        "  rehearse:",
        "    steps:",
        "      - run: >",
        "          npm publish ./core.tgz",
        ...rest,
        "",
      ].join("\n");
      expect(scan(".github/workflows/release.yml", workflow)).toEqual([
        {
          file: ".github/workflows/release.yml",
          line: 4,
          command: "publish",
        },
      ]);
    },
  );

  it("does not take a dry run after a quoted line break that the YAML string has not decoded", () => {
    const workflow = [
      "jobs:",
      "  rehearse:",
      "    steps:",
      '      - run: "npm publish ./b.tgz\\nnpm publish ./a.tgz --dry-run"',
      "",
    ].join("\n");
    expect(
      scan(".github/workflows/release.yml", workflow).length,
    ).toBeGreaterThan(0);
  });

  it("does not let a folded block hide a second publish after a dry run", () => {
    const workflow = [
      "jobs:",
      "  rehearse:",
      "    steps:",
      "      - run: >",
      "          npm publish ./core.tgz --dry-run",
      "          npm publish ./map.tgz",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([
      { file: ".github/workflows/release.yml", line: 4, command: "publish" },
      { file: ".github/workflows/release.yml", line: 4, command: "publish" },
    ]);
  });

  it("allows a folded block that folds a dry run onto several lines", () => {
    const workflow = [
      "jobs:",
      "  rehearse:",
      "    steps:",
      "      - run: >",
      "          npm publish ./core.tgz",
      "          --provenance",
      "          --dry-run",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([]);
  });

  it("does not take a dry-run word on an earlier line for the publish that a backslash continues into", () => {
    const workflow = [
      "jobs:",
      "  rehearse:",
      "    steps:",
      "      - run: |",
      "          echo --dry-run && \\",
      "          npm publish ./core.tgz",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([
      { file: ".github/workflows/release.yml", line: 5, command: "publish" },
    ]);
  });

  it("allows a dry run with the usual options and a quoted flag, in a command that is followed by another", () => {
    const workflow = [
      "jobs:",
      "  rehearse:",
      "    steps:",
      '      - run: npm publish "$X/c.tgz" --ignore-scripts --tag "$T" --provenance "--dry-run" && echo done',
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([]);
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
    expect(isExecutable("packages/web/src/app/App.tsx")).toBe(true);
    expect(isExecutable("packages/web/public/robots.txt")).toBe(false);
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

describe("lines that a shell or YAML reader joins", () => {
  const scan = (file: string, text: string) =>
    scanSources([{ path: file, text }]) as {
      file: string;
      line: number;
      command: string;
    }[];

  it("finds a command split by a backslash in a run block, with the first line", () => {
    const workflow = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |",
      "          npm \\",
      "            publish",
      "",
    ].join("\n");
    expect(scan(".github/workflows/ci.yml", workflow)).toEqual([
      { file: ".github/workflows/ci.yml", line: 5, command: "publish" },
    ]);
  });

  it("finds a command split by a backslash in a shell script and a Dockerfile", () => {
    expect(scan("scripts/ship.sh", "npm \\\n  publish\n")).toHaveLength(1);
    expect(scan("Dockerfile", "RUN npm \\\n    publish\n")).toHaveLength(1);
  });

  it("finds a command split across the lines of a folded block", () => {
    const workflow = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: >",
      "          npm",
      "          publish",
      "      - run: npm ci",
      "",
    ].join("\n");
    expect(scan(".github/workflows/ci.yml", workflow)).toEqual([
      { file: ".github/workflows/ci.yml", line: 4, command: "publish" },
    ]);
  });

  it("finds it in a folded block with a stripping indicator", () => {
    const workflow =
      "jobs:\n  a:\n    steps:\n      - run: >-\n          npm stage\n          approve\n";
    expect(scan(".github/workflows/ci.yml", workflow)).toHaveLength(1);
  });

  it("does not join across the end of a folded block", () => {
    const workflow =
      "jobs:\n  a:\n    steps:\n      - run: >\n          echo npm\n      - run: publish-notes\n";
    expect(scan(".github/workflows/ci.yml", workflow)).toEqual([]);
  });

  it("keeps a hash inside quotes and removes a real comment", () => {
    expect(stripShellComment('echo " #" && npm publish')).toBe(
      'echo " #" && npm publish',
    );
    expect(stripShellComment("echo '#' # npm publish")).toBe("echo '#' ");
    expect(stripShellComment("npm ci # npm publish")).toBe("npm ci ");
    expect(stripShellComment("# npm publish")).toBe("");
    expect(stripShellComment("echo a#b")).toBe("echo a#b");
    expect(stripShellComment('echo "a \\" # b" # c')).toBe('echo "a \\" # b" ');
  });

  it("finds a command after a quoted hash in a workflow, a script, a Dockerfile and a Makefile", () => {
    const line = 'echo " #" && npm publish';
    expect(
      scan(
        ".github/workflows/ci.yml",
        `jobs:\n  a:\n    steps:\n      - run: ${line}\n`,
      ),
    ).toHaveLength(1);
    expect(scan("scripts/ship.sh", `${line}\n`)).toHaveLength(1);
    expect(scan("Dockerfile", `RUN ${line}\n`)).toHaveLength(1);
    expect(scan("Makefile", `ship:\n\t${line}\n`)).toHaveLength(1);
  });
});

describe("what is read beyond scripts", () => {
  const scan = (file: string, text: string) =>
    scanSources([{ path: file, text }]) as {
      file: string;
      line: number;
      command: string;
    }[];

  it("reads any script or configuration file in the repository", () => {
    const source = 'run("npm", ["publish"]);\n';
    for (const file of [
      "packages/web/vite.config.ts",
      "packages/core/src/anything.ts",
      "packages/web/src/app/App.tsx",
      "playwright.config.mts",
      "tools/build.cjs",
    ]) {
      expect(scan(file, source), file).toHaveLength(1);
    }
  });

  it("reads hook folders", () => {
    expect(scan(".husky/pre-push", "npm publish\n")).toHaveLength(1);
    expect(scan(".claude/hooks/after.sh", "npm publish\n")).toHaveLength(1);
    expect(
      scan(".claude/hooks/after.mjs", 'run("npm", ["publish"]);'),
    ).toHaveLength(1);
  });

  it("fails on a publish action in any workflow", () => {
    for (const action of [
      "JS-DevTools/npm-publish@0123456789abcdef0123456789abcdef01234567",
      "someone/publish-npm@v1",
      "changesets/action@v1",
      "cycjimmy/semantic-release-action@v4",
    ]) {
      const workflow = `jobs:\n  a:\n    steps:\n      - uses: ${action}\n`;
      expect(scan(".github/workflows/ci.yml", workflow), action).toEqual([
        {
          file: ".github/workflows/ci.yml",
          line: 4,
          command: "publish action",
        },
      ]);
    }
    const harmless =
      "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v5\n";
    expect(scan(".github/workflows/ci.yml", harmless)).toEqual([]);
  });

  it("fails on a YAML anchor or alias in a workflow", () => {
    const anchored = [
      "jobs:",
      "  verify: &steps",
      "    steps:",
      "      - run: npm ci",
      "  npm:",
      "    <<: *steps",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", anchored)).toEqual([
      {
        file: ".github/workflows/release.yml",
        line: 2,
        command: "yaml anchor or alias",
      },
      {
        file: ".github/workflows/release.yml",
        line: 6,
        command: "yaml anchor or alias",
      },
    ]);
    expect(scan(".github/workflows/ci.yml", anchored)).toHaveLength(2);
  });

  it("does not take a glob or a shell operator in release.yml for an alias", () => {
    const workflow = [
      "jobs:",
      "  npm:",
      "    steps:",
      "      - run: npm publish ./*.tgz --provenance && echo done",
      "      - run: ls *.tgz",
      "",
    ].join("\n");
    expect(scan(".github/workflows/release.yml", workflow)).toEqual([]);
  });
});

describe("publishesOnlyDryRuns", () => {
  it("is true only when every publish in the text carries the exact word", () => {
    expect(publishesOnlyDryRuns("npm publish a.tgz --dry-run")).toBe(true);
    expect(
      publishesOnlyDryRuns(
        "npm publish a.tgz --dry-run && npm publish b.tgz --dry-run",
      ),
    ).toBe(true);
    expect(
      publishesOnlyDryRuns("npm publish a.tgz --dry-run && npm publish b.tgz"),
    ).toBe(false);
    expect(publishesOnlyDryRuns("echo hello")).toBe(false);
    expect(publishesOnlyDryRuns("npm publish a.tgz --dry-run=false")).toBe(
      false,
    );
    expect(publishesOnlyDryRuns("npm publish a.tgz --dry-run false")).toBe(
      false,
    );
    expect(publishesOnlyDryRuns("npm publish a.tgz --no-dry-run")).toBe(false);
    expect(
      publishesOnlyDryRuns("npm publish a.tgz --dry-run\nnpm publish b.tgz"),
    ).toBe(false);
  });
});

describe("spellings that get past a plain word match", () => {
  it.each([
    ["a flow mapping step", "- {run: npm publish}"],
    ["a flow sequence of steps", 'steps: [{run: "npm publish"}]'],
    ["a lefthook flow command", 'p: {run: "npm publish"}'],
    ["a Dockerfile exec form", 'RUN ["npm","publish"]'],
    ["a Dockerfile CMD exec form", 'CMD ["npm", "publish"]'],
    ["a compose command list", 'command: ["npm", "publish"]'],
    ["a compose command list of plain words", "command: [npm, publish]"],
    ["an ANSI-C quoted program", "$'npm' publish"],
    ["an ANSI-C quoted command", "npm $'publish'"],
    ["an empty quote inside the command", "npm pub''lish"],
    ["a quote inside the command", 'npm "pub"lish'],
    ["a backslash inside the command", "npm p\\ublish"],
    ["a backslash inside the program", "n\\pm publish"],
    ["an empty quote inside the program", "n''pm publish"],
    ["a brace expansion", "npm {publish,pack}"],
    ["an option with a value this check lists", "yarn --cwd pkg publish"],
    [
      "an option that is not listed, before a command that is",
      "npm --other pkg publish",
    ],
    ["pnpm recursive", "pnpm -r publish"],
    ["pnpm filtered", "pnpm --filter core publish"],
    ["yarn workspaces foreach", "yarn workspaces foreach -A npm publish"],
    ["bunx", "bunx npm publish"],
    ["corepack with pnpm", "corepack pnpm publish"],
  ])("finds %s", (_name, line) => {
    expect(inShell(`${line}`).length, line).toBeGreaterThan(0);
  });

  it.each([
    "npm run publish:docs",
    "npm --prefix web run publish:docs",
    'echo "{run: ls}"',
    "echo [a, b]",
    "yarn --cwd pkg build",
    "pnpm -r build",
    "bunx vitest run",
    "npm install --save-dev left-pad",
  ])("still leaves %s alone", (line) => {
    expect(inShell(line)).toEqual([]);
  });

  it("strips a real comment after the new quote handling", () => {
    expect(stripShellComment("echo \\ # npm publish")).toBe(
      "echo \\ # npm publish",
    );
    expect(stripShellComment("echo $'a\\'b' # npm publish")).toBe(
      "echo $'a\\'b' ",
    );
    expect(stripShellComment("echo $(date) # npm publish")).toBe(
      "echo $(date) # npm publish",
    );
    expect(stripShellComment("echo a\\#b # c")).toBe("echo a\\#b ");
  });
});

describe("YAML scalars and files beyond the first version", () => {
  const scan = (file: string, text: string) =>
    scanSources([{ path: file, text }]) as {
      file: string;
      line: number;
      command: string;
    }[];
  const workflow = (step: string) => `jobs:\n  a:\n    steps:\n${step}\n`;

  it.each([
    ["a multi-line plain scalar", "      - run: npm\n          publish"],
    [
      "a multi-line double-quoted scalar",
      '      - run: "npm\n          publish"',
    ],
    [
      "a multi-line single-quoted scalar",
      "      - run: 'npm\n          publish'",
    ],
    [
      "a folded scalar with an indentation indicator",
      "      - run: >2-\n          npm\n          publish",
    ],
    [
      "a folded scalar with the indicator after the chomp",
      "      - run: >-2\n          npm\n          publish",
    ],
    [
      "a plain scalar that starts on the next line",
      "      - run:\n          npm\n          publish",
    ],
  ])("joins %s", (_name, step) => {
    expect(scan(".github/workflows/ci.yml", workflow(step))).toHaveLength(1);
  });

  it("does not join a literal block, a sibling key or a list", () => {
    expect(
      scan(
        ".github/workflows/ci.yml",
        workflow(
          "      - run: |2\n          echo npm\n          publish-notes",
        ),
      ),
    ).toEqual([]);
    expect(
      scan(
        ".github/workflows/ci.yml",
        workflow("      - run: echo npm\n        name: publish"),
      ),
    ).toEqual([]);
  });

  it("finds a command in a lefthook flow command and in the dotted file name", () => {
    expect(
      scan(
        "lefthook.yml",
        'pre-push:\n  commands:\n    p: {run: "npm publish"}\n',
      ),
    ).toHaveLength(1);
    expect(
      scan(
        ".lefthook.yml",
        "pre-push:\n  commands:\n    p:\n      run: npm publish\n",
      ),
    ).toHaveLength(1);
    expect(
      scan(".config/lefthook-local.yaml", "x:\n  run: npm publish\n"),
    ).toHaveLength(1);
  });

  it("reads a Justfile, a lower-case makefile and the compose and CI files", () => {
    expect(scan("Justfile", "ship:\n  npm publish\n")).toHaveLength(1);
    expect(scan(".justfile", "ship:\n  npm publish\n")).toHaveLength(1);
    expect(scan("makefile", "ship:\n\tnpm publish\n")).toHaveLength(1);
    expect(
      scan(
        "docker-compose.yml",
        "services:\n  a:\n    command: [npm, publish]\n",
      ),
    ).toHaveLength(1);
    expect(
      scan("compose.prod.yaml", "services:\n  a:\n    command: npm publish\n"),
    ).toHaveLength(1);
    expect(
      scan(".gitlab-ci.yml", "release:\n  script:\n    - npm publish\n"),
    ).toHaveLength(1);
    expect(scan("Dockerfile", 'CMD ["npm", "publish"]\n')).toHaveLength(1);
  });

  it("reads the command strings of editor, agent and Cloudflare configuration", () => {
    const hook = JSON.stringify({
      hooks: {
        PostToolUse: [{ hooks: [{ type: "command", command: "npm publish" }] }],
      },
    });
    expect(scan(".claude/settings.json", hook)).toHaveLength(1);
    const tasks = JSON.stringify({
      version: "2.0.0",
      tasks: [{ label: "x", command: "npm", args: ["publish"] }],
    });
    expect(scan(".vscode/tasks.json", tasks)).toHaveLength(1);
    const wrangler =
      '{\n  // build\n  "build": { "command": "npm publish", },\n}\n';
    expect(scan("wrangler.jsonc", wrangler)).toEqual([
      { file: "wrangler.jsonc", line: 3, command: "publish" },
    ]);
    expect(scan("wrangler.jsonc", '{ "name": "npm publish" }')).toEqual([]);
    expect(
      scan(
        ".devcontainer/devcontainer.json",
        '{"postCreateCommand": "npm publish"}',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["after an escaped space", "echo \\ #; npm publish"],
    [
      "after an ANSI-C string with an escaped quote",
      "echo $'\\' #' ; npm publish",
    ],
  ])("keeps a command that follows a hash %s", (_name, line) => {
    expect(scan("scripts/ship.sh", `${line}\n`)).toHaveLength(1);
    expect(
      scan(".github/workflows/ci.yml", workflow(`      - run: ${line}`)),
    ).toHaveLength(1);
  });

  it("does not take a deny list for a command", () => {
    const denyList = JSON.stringify({
      permissions: { deny: ["Bash(npm publish *)", "Bash(npm login)"] },
    });
    expect(scan(".claude/settings.json", denyList)).toEqual([]);
    expect(scan(".qwen/settings.json", denyList)).toEqual([]);
  });

  it("reads the manifest keys that run commands, and not its prose", () => {
    const lintStaged = JSON.stringify({
      "lint-staged": { "*.ts": ["biome check", "npm publish"] },
    });
    expect(scan("package.json", lintStaged)).toHaveLength(1);
    const hooks = JSON.stringify({
      "simple-git-hooks": { "pre-push": "npm publish" },
    });
    expect(scan("packages/core/package.json", hooks)).toHaveLength(1);
    const prose = JSON.stringify({
      name: "npm publish",
      description: "npm publish",
      keywords: ["npm publish"],
      repository: "npm publish",
      scripts: { build: "tsc" },
    });
    expect(scan("package.json", prose)).toEqual([]);
  });

  it.each([
    ["a following line", "      - uses:\n          JS-DevTools/npm-publish@v1"],
    ["a quoted key", '      - "uses": JS-DevTools/npm-publish@v1'],
    ["a single-quoted key and value", "      - 'uses': 'changesets/action@v1'"],
    ["a flow mapping", "      - {uses: JS-DevTools/npm-publish@v1}"],
  ])("fails a publish action given on %s", (_name, step) => {
    expect(scan(".github/workflows/ci.yml", workflow(step))).toEqual([
      { file: ".github/workflows/ci.yml", line: 4, command: "publish action" },
    ]);
  });

  it("fails a YAML anchor or alias in every workflow, not only release.yml", () => {
    for (const file of [
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
      ".github/actions/x/action.yml",
    ]) {
      const alias = workflow("      - run: *pub");
      expect(
        scan(file, alias).map((f) => f.command),
        file,
      ).toEqual(["yaml anchor or alias"]);
      const anchor = workflow("      - x: &a npm publish");
      expect(
        scan(file, anchor).map((f) => f.command),
        file,
      ).toContain("yaml anchor or alias");
    }
  });
});

describe("the guard itself", () => {
  it("exempts only itself and the tests that hold the commands as fixtures", () => {
    expect([...EXEMPT_FILES].sort()).toEqual([
      "packages/core/src/lint/agentDenyLists.test.ts",
      "packages/core/src/lint/publishGuard.test.ts",
      "packages/core/src/lint/publishGuardWorkflows.test.ts",
      "scripts/release/publishGuard.mjs",
    ]);
  });

  it("starts one process only, git, with an argument array and no shell", () => {
    const source = readFileSync(
      path.join(REPO, "scripts/release/publishGuard.mjs"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const calls = source.match(
      /(?<![.\w])(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/g,
    );
    expect(calls).toEqual(["execFileSync("]);
    expect(source).toMatch(/execFileSync\(\s*"git",\s*\[/);
    expect(source).not.toMatch(/shell:\s*true/);
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

  it("is run by npm run lint and by the pre-commit hook", () => {
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
