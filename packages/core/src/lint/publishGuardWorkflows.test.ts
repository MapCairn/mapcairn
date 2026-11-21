// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  jobRanges,
  NPM_JOB,
  publishesOnlyDryRuns,
  RELEASE_WORKFLOW,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/publishGuard.mjs";
import {
  internalDependencies,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/verifyRelease.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const WORKFLOWS = ".github/workflows";

/** The jobs that may hold `id-token: write`, by workflow file. */
const ID_TOKEN_JOBS: Record<string, string[]> = {
  "release.yml": ["github-release", NPM_JOB],
  "scorecard.yml": ["analysis"],
};

/** A workflow's text without comments, so a note cannot pass for a setting. */
function withoutComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n");
}

/**
 * The jobs (or "(workflow)" for the top level) that hold `id-token: write`.
 */
function idTokenWriters(text: string): string[] {
  const clean = withoutComments(text);
  const ranges = [...jobRanges(clean)] as [
    string,
    { start: number; end: number },
  ][];
  return clean.split("\n").flatMap((line, index) => {
    if (!/id-token["']?\s*:\s*["']?write\b/.test(line)) {
      return [];
    }
    const lineNumber = index + 1;
    const job = ranges.find(
      ([, range]) => lineNumber >= range.start && lineNumber <= range.end,
    );
    return [job === undefined ? "(workflow)" : job[0]];
  });
}

/** What a workflow's top-level `permissions:` says, one entry for each line below it. */
function topLevelPermissions(text: string): string[] | undefined {
  const lines = withoutComments(text).split("\n");
  const start = lines.findIndex((line) => /^permissions:/.test(line));
  if (start === -1) {
    return undefined;
  }
  const inline = lines[start].replace(/^permissions:\s*/, "").trim();
  const block: string[] = inline === "" ? [] : [inline];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) {
      break;
    }
    if (line.trim() !== "") {
      block.push(line.trim());
    }
  }
  return block;
}

/** Why a workflow breaks the least-privilege rule, or nothing. */
function permissionProblems(text: string): string[] {
  const top = topLevelPermissions(text);
  if (top === undefined) {
    return ["has no top-level permissions"];
  }
  const problems: string[] = [];
  if (top.some((entry) => /write/.test(entry))) {
    problems.push("grants write at the top level");
  }
  if (/permissions:\s*(?:write-all|read-all)\b/.test(withoutComments(text))) {
    problems.push("uses write-all or read-all");
  }
  return problems;
}

function workflowFiles(): string[] {
  return readdirSync(path.join(REPO, WORKFLOWS)).filter((file) =>
    /\.ya?ml$/.test(file),
  );
}

function readWorkflow(file: string): string {
  return readFileSync(path.join(REPO, WORKFLOWS, file), "utf8");
}

describe("id-token: write", () => {
  it("is held only by release.yml (github-release and npm) and by the analysis job of scorecard.yml", () => {
    const problems = workflowFiles().flatMap((file) => {
      const allowed = ID_TOKEN_JOBS[file] ?? [];
      return idTokenWriters(readWorkflow(file))
        .filter((job) => !allowed.includes(job))
        .map((job) => `${file}: ${job}`);
    });
    expect(problems).toEqual([]);
  });

  it("is found at the top of a workflow, in another job and in a flow-style mapping", () => {
    const top = "permissions:\n  id-token: write\njobs:\n  a:\n    steps: []\n";
    expect(idTokenWriters(top)).toEqual(["(workflow)"]);
    const other =
      "permissions: {}\njobs:\n  a:\n    permissions:\n      id-token: write\n";
    expect(idTokenWriters(other)).toEqual(["a"]);
    const flow =
      'permissions: { id-token: write }\njobs:\n  a:\n    permissions: { contents: read, id-token: write }\n  b:\n    permissions: {"id-token": write}\n';
    expect(idTokenWriters(flow)).toEqual(["(workflow)", "a", "b"]);
    const quoted = "jobs:\n  a:\n    permissions:\n      'id-token': 'write'\n";
    expect(idTokenWriters(quoted)).toEqual(["a"]);
    const inRelease =
      "jobs:\n  npm:\n    permissions:\n      id-token: write\n  verify:\n    permissions:\n      id-token: write\n";
    expect(idTokenWriters(inRelease)).toEqual(["npm", "verify"]);
  });

  it("does not count a comment or a read", () => {
    const text =
      "permissions: {}\njobs:\n  a:\n    permissions:\n      id-token: read # not write\n      # id-token: write\n";
    expect(idTokenWriters(text)).toEqual([]);
  });

  it("is still held by the scorecard analysis job, so the allowance names a job that exists", () => {
    expect(idTokenWriters(readWorkflow("scorecard.yml"))).toEqual(["analysis"]);
  });
});

describe("least privilege", () => {
  it("gives every workflow top-level permissions that grant no write", () => {
    const problems = workflowFiles().flatMap((file) =>
      permissionProblems(readWorkflow(file)).map(
        (problem) => `${file} ${problem}`,
      ),
    );
    expect(problems).toEqual([]);
  });

  it("fails a workflow without permissions, with a write at the top, or with write-all", () => {
    expect(permissionProblems("name: x\njobs: {}\n")).toEqual([
      "has no top-level permissions",
    ]);
    expect(
      permissionProblems("permissions:\n  contents: write\njobs: {}\n"),
    ).toEqual(["grants write at the top level"]);
    expect(permissionProblems("permissions: write-all\njobs: {}\n")).toEqual([
      "grants write at the top level",
      "uses write-all or read-all",
    ]);
    expect(
      permissionProblems(
        "permissions: {}\njobs:\n  a:\n    permissions: write-all\n",
      ),
    ).toEqual(["uses write-all or read-all"]);
  });

  it("passes empty and read-only permissions", () => {
    expect(permissionProblems("permissions: {}\njobs: {}\n")).toEqual([]);
    expect(
      permissionProblems(
        "permissions:\n  contents: read # check out\njobs: {}\n",
      ),
    ).toEqual([]);
  });
});

/** The lines of one job of a workflow, without comments, or none. */
function jobLinesOf(text: string, name: string): string[] {
  const clean = withoutComments(text);
  const range = (
    jobRanges(clean) as Map<string, { start: number; end: number }>
  ).get(name);
  return range === undefined
    ? []
    : clean.split("\n").slice(range.start - 1, range.end);
}

/** The lines of the `npm` job of a workflow, or none. */
function npmJobLines(text: string): string[] {
  return jobLinesOf(text, NPM_JOB);
}

/** The job's own `if:` (four spaces in), with the lines of a folded condition below it. */
function jobCondition(lines: string[]): string {
  const index = lines.findIndex((line) => /^ {4}if:/.test(line));
  if (index === -1) {
    return "";
  }
  const rest: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= 4) {
      break;
    }
    rest.push(line);
  }
  return [lines[index], ...rest].join("\n");
}

/** Why the `npm` job of a workflow is not as the plan describes it. */
function npmJobProblems(text: string): string[] {
  const lines = npmJobLines(text);
  if (lines.length === 0) {
    return ["has no npm job"];
  }
  const job = lines.join("\n");
  const problems: string[] = [];
  if (!/^ {4}environment:\s*npm\b/m.test(job)) {
    problems.push("does not run in the npm environment");
  }
  if (!/refs\/heads\/main/.test(jobCondition(lines))) {
    problems.push("does not run only on main");
  }
  if (!/id-token["']?\s*:\s*["']?write\b/.test(job)) {
    problems.push("has no id-token: write");
  }
  if (!/contents["']?\s*:\s*["']?read\b/.test(job)) {
    problems.push("does not read contents only");
  }
  return problems;
}

/** The shape the plan gives the job, with its condition folded over several lines. */
const PLAN_NPM_JOB = [
  "jobs:",
  "  verify:",
  "    runs-on: ubuntu-latest",
  "  npm:",
  "    runs-on: ubuntu-latest",
  "    environment: npm",
  "    if: >-",
  "      always() &&",
  "      github.ref == 'refs/heads/main' &&",
  "      needs.verify.result == 'success'",
  "    permissions:",
  "      id-token: write",
  "      contents: read",
  "    steps:",
  "      - run: npm publish ./core.tgz --tag next --provenance",
  "",
].join("\n");

/** What neither job that runs `npm publish` may hold: a token, an access flag, a hard-coded tag, staging or a tag change. */
const FORBIDDEN_IN_PUBLISH_JOBS = [
  "NODE_AUTH_TOKEN",
  "NPM_TOKEN",
  "secrets.",
  "registry-url",
  "npm stage",
  "npm dist-tag",
  "--access",
  "--tag latest",
  "--tag next",
];

describe("release.yml", () => {
  const file = path.join(REPO, RELEASE_WORKFLOW);

  it("has an npm job as the plan describes it, once the workflow exists", () => {
    if (!existsSync(file)) {
      // Built in #433; until then the guard allows no workflow to publish.
      return;
    }
    expect(npmJobProblems(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("publishes the release's own tarballs in the npm job, by absolute path, with no scripts, under the dist-tag the verify job decided and with provenance", () => {
    const job = npmJobLines(readFileSync(file, "utf8")).join("\n");
    expect(job).toContain(
      'npm publish "$GITHUB_WORKSPACE/release/mapcairn-$name-$VERSION.tgz" --ignore-scripts --tag "$DIST_TAG" --provenance',
    );
    expect(job).toContain("needs.verify.outputs.dist-tag");
    expect(job).not.toContain("--dry-run");
    expect(job).not.toContain("MODE");
  });

  it("holds no token, no staging, no dist-tag change and no access flag", () => {
    const job = npmJobLines(readFileSync(file, "utf8")).join("\n");
    for (const forbidden of FORBIDDEN_IN_PUBLISH_JOBS) {
      expect(job, forbidden).not.toContain(forbidden);
    }
  });

  it("runs only for a real publish whose checks passed: the check and verify results, the main branch and not a rehearsal", () => {
    const condition = jobCondition(npmJobLines(readFileSync(file, "utf8")));
    for (const required of [
      "needs.check.result == 'success'",
      "needs.verify.result == 'success'",
      "needs.verify.outputs.release == 'true'",
      "inputs.mode != 'rehearse'",
      "refs/heads/main",
    ]) {
      expect(condition, required).toContain(required);
    }
    expect(condition).not.toContain("||");
    // The registry is read per package in the publishing step (#539), so a
    // package npm does not have yet never skips the whole set.
    expect(condition).not.toContain("on-npm");
  });

  it("skips a package already on npm with a notice, and stops on any registry error", () => {
    const job = npmJobLines(readFileSync(file, "utf8")).join("\n");
    expect(job).toContain(
      'state="$(node scripts/release/verifyRelease.mjs package-state "@mapcairn/$name" "$VERSION")"',
    );
    expect(job).toMatch(
      /if \[ "\$state" = "published" \]; then\n\s+echo "::notice::[^\n]*"\n\s+continue\n\s+fi/,
    );
    expect(job).toContain(
      "::notice::@mapcairn/$name@$VERSION is already on npm",
    );
    expect(job).not.toContain("|| true");
  });

  it("reads the registry back after each publish", () => {
    const job = npmJobLines(readFileSync(file, "utf8")).join("\n");
    expect(job).toMatch(
      /npm publish [^\n]*\n\s+node scripts\/release\/verifyRelease\.mjs confirm-published "@mapcairn\/\$name" "\$VERSION"/,
    );
  });

  it("publishes nothing while a manifest is private, and says so", () => {
    const job = npmJobLines(readFileSync(file, "utf8")).join("\n");
    expect(job).toMatch(
      /name: Say why nothing is published[\s\S]*?if: needs\.verify\.outputs\.private == 'true'/,
    );
    expect(job).toMatch(
      /name: Publish the packages\n\s+if: needs\.verify\.outputs\.private != 'true'/,
    );
  });

  it("checks the digests before it publishes, uses an npm that supports trusted publishing, installs the pinned one without scripts, and has its own group for the version", () => {
    const job = npmJobLines(readFileSync(file, "utf8")).join("\n");
    expect(job).toContain(
      'tarballs.mjs check release "$DIGESTS" "$NOTES_DIGEST"',
    );
    expect(
      job.indexOf('tarballs.mjs check release "$DIGESTS" "$NOTES_DIGEST"'),
    ).toBeLessThan(job.indexOf("npm publish"));
    expect(job).toContain("required=11.5.1");
    expect(job).toContain(
      'npm install --global --ignore-scripts "npm@$wanted"',
    );
    expect(job.indexOf("required=11.5.1")).toBeLessThan(
      job.indexOf("npm publish"),
    );
    expect(job).toMatch(
      /concurrency:\n\s+group: release-npm-\$\{\{ needs\.verify\.outputs\.version \}\}\n\s+cancel-in-progress: false/,
    );
    expect(job).not.toContain("and are exactly the four tarballs");
  });

  it("puts the dry run of a rehearsal in a job with no environment and no OIDC token, so only a real publish ever waits for an approval", () => {
    const job = jobLinesOf(readFileSync(file, "utf8"), "rehearse").join("\n");
    expect(job).not.toBe("");
    expect(job).not.toMatch(/\benvironment\s*:/);
    expect(job).not.toContain("id-token");
    for (const forbidden of FORBIDDEN_IN_PUBLISH_JOBS) {
      expect(job, forbidden).not.toContain(forbidden);
    }
    expect(job).toMatch(/permissions:\n\s+contents: read\s*\n/);
    const condition = jobCondition(
      jobLinesOf(readFileSync(file, "utf8"), "rehearse"),
    );
    for (const required of [
      "inputs.mode == 'rehearse'",
      "needs.check.result == 'success'",
      "needs.verify.result == 'success'",
      "refs/heads/main",
    ]) {
      expect(condition, required).toContain(required);
    }
    expect(condition).not.toContain("||");
    const publishes = job
      .split("\n")
      .filter((line) => /npm publish/.test(line));
    expect(publishes).toHaveLength(1);
    expect(publishesOnlyDryRuns(publishes[0])).toBe(true);
    expect(job).not.toContain("confirm-published");
  });

  it("accepts the plan's job, with a condition folded over several lines or on one", () => {
    expect(npmJobProblems(PLAN_NPM_JOB)).toEqual([]);
    const oneLine = PLAN_NPM_JOB.replace(
      / {4}if: >-\n(?: {6}.*\n){3}/,
      "    if: github.ref == 'refs/heads/main'\n",
    );
    expect(npmJobProblems(oneLine)).toEqual([]);
  });

  it("fails a job without the environment, the condition on main, the token or read-only contents", () => {
    expect(npmJobProblems("jobs:\n  verify:\n    steps: []\n")).toEqual([
      "has no npm job",
    ]);
    expect(
      npmJobProblems(PLAN_NPM_JOB.replace("    environment: npm\n", "")),
    ).toEqual(["does not run in the npm environment"]);
    expect(
      npmJobProblems(
        PLAN_NPM_JOB.replace("github.ref == 'refs/heads/main' &&", "true &&"),
      ),
    ).toEqual(["does not run only on main"]);
    expect(
      npmJobProblems(PLAN_NPM_JOB.replace("      id-token: write\n", "")),
    ).toEqual(["has no id-token: write"]);
    expect(
      npmJobProblems(PLAN_NPM_JOB.replace("contents: read", "contents: write")),
    ).toEqual(["does not read contents only"]);
  });

  it("does not take a step's condition for the job's", () => {
    const stepOnly = PLAN_NPM_JOB.replace(
      / {4}if: >-\n(?: {6}.*\n){3}/,
      "",
    ).replace(
      "      - run:",
      "      - if: github.ref == 'refs/heads/main'\n        run:",
    );
    expect(npmJobProblems(stepOnly)).toEqual(["does not run only on main"]);
  });
});

/** The shell of one step of the `npm` job, as the runner would run it. */
function stepScript(jobText: string, stepName: string): string {
  const lines = jobText.split("\n");
  const start = lines.findIndex((line) => line.includes(`name: ${stepName}`));
  expect(start, stepName).toBeGreaterThan(-1);
  const run = lines.findIndex(
    (line, index) => index > start && /^\s+run: \|\s*$/.test(line),
  );
  expect(run, stepName).toBeGreaterThan(-1);
  const indent = lines[run + 1].search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && line.search(/\S/) < indent) {
      break;
    }
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

interface StepRun {
  status: number | null;
  stdout: string;
  /** What the fake `npm` and `node` were asked to run, in order. */
  calls: string[];
}

/**
 * Runs the publishing step with a fake `node` (which answers the registry
 * reads from `states`) and a fake `npm` (which records what it was asked to
 * publish), so the loop's decisions are tested without a registry or a login.
 */
function runPublishStep(input: {
  mode: string;
  version?: string;
  distTag?: string;
  /** Per package, what `package-state` prints: published, missing, new or error. */
  states: Record<string, string>;
  /** Per package, the internal packages its tarball depends on. */
  dependencies?: Record<string, string[]>;
  /** Packages whose tarball cannot be read for its dependencies. */
  dependenciesFail?: string[];
  /** Packages whose publish command fails. */
  publishFails?: string[];
  /** Packages whose read-back fails. */
  confirmFails?: string[];
}): StepRun {
  const folder = mkdtempSync(path.join(tmpdir(), "publish-step-"));
  try {
    const bin = path.join(folder, "bin");
    mkdirSync(bin);
    const log = path.join(folder, "calls.log");
    const shim = (name: string, body: string) => {
      writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`);
      chmodSync(path.join(bin, name), 0o755);
    };
    const states = path.join(folder, "states");
    mkdirSync(states);
    for (const [name, state] of Object.entries(input.states)) {
      writeFileSync(path.join(states, name), state);
    }
    const dependencies = path.join(folder, "deps");
    mkdirSync(dependencies);
    for (const [name, deps] of Object.entries(input.dependencies ?? {})) {
      writeFileSync(path.join(dependencies, name), deps.join("\n"));
    }
    const dependenciesFail = path.join(folder, "deps-fail");
    mkdirSync(dependenciesFail);
    for (const name of input.dependenciesFail ?? []) {
      writeFileSync(path.join(dependenciesFail, name), "");
    }
    const confirmFails = path.join(folder, "confirm-fails");
    mkdirSync(confirmFails);
    for (const name of input.confirmFails ?? []) {
      writeFileSync(path.join(confirmFails, name), "");
    }
    const publishFails = path.join(folder, "publish-fails");
    mkdirSync(publishFails);
    for (const name of input.publishFails ?? []) {
      writeFileSync(path.join(publishFails, name), "");
    }
    shim(
      "node",
      [
        'echo "node $*" >> "$LOG"',
        'short="${3#@mapcairn/}"',
        'case "$2" in',
        "  package-state)",
        '    state="$(cat "$FOLDER/states/$short")"',
        '    if [ "$state" = "error" ]; then echo "Could not ask the registry" >&2; exit 1; fi',
        '    echo "$state"',
        "    ;;",
        "  dependencies)",
        '    if [ -e "$FOLDER/deps-fail/$short" ]; then echo "Could not read package.json" >&2; exit 1; fi',
        '    if [ -e "$FOLDER/deps/$short" ]; then cat "$FOLDER/deps/$short"; fi',
        "    ;;",
        "  confirm-published)",
        '    if [ -e "$FOLDER/confirm-fails/$short" ]; then echo "did not appear" >&2; exit 1; fi',
        "    ;;",
        "esac",
      ].join("\n"),
    );
    shim(
      "npm",
      [
        'echo "npm $*" >> "$LOG"',
        'name="$(basename "$2")"',
        'name="${name#mapcairn-}"',
        'name="${name%-"$VERSION".tgz}"',
        'if [ -e "$FOLDER/publish-fails/$name" ]; then echo "npm error code E403" >&2; exit 1; fi',
      ].join("\n"),
    );
    const rehearsal = input.mode === "rehearse";
    const script = stepScript(
      jobLinesOf(
        readFileSync(path.join(REPO, RELEASE_WORKFLOW), "utf8"),
        rehearsal ? "rehearse" : NPM_JOB,
      ).join("\n"),
      rehearsal ? "Dry-run the publishing" : "Publish the packages",
    );
    const result = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
      cwd: folder,
      encoding: "utf8",
      env: {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        LOG: log,
        FOLDER: folder,
        GITHUB_WORKSPACE: folder,
        VERSION: input.version ?? "0.1.0-rc.2",
        DIST_TAG: input.distTag ?? "next",
      },
    });
    const calls = existsSync(log)
      ? readFileSync(log, "utf8").split("\n").filter(Boolean)
      : [];
    return {
      status: result.status,
      stdout: result.stdout,
      calls: calls.map((call) => call.replaceAll(folder, "<workspace>")),
    };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const ALL_MISSING = {
  core: "missing",
  react: "missing",
  theme: "missing",
  map: "missing",
  "adapter-maplibre": "missing",
  sdk: "missing",
};

/** What the loop ran, without the registry reads. */
function actions(run: StepRun): string[] {
  return run.calls.filter(
    (call) =>
      !call.includes("package-state") && !call.includes(" dependencies "),
  );
}

/** The tarballs the loop asked npm to publish, in order. */
function publishedTarballs(run: StepRun): string[] {
  return actions(run)
    .filter((call) => call.startsWith("npm "))
    .map((call) => call.split(" ")[2]);
}

/** What each package's tarball depends on, read from the six manifests so it cannot drift. */
const DEPENDENCIES = Object.fromEntries(
  ["core", "react", "theme", "map", "adapter-maplibre", "sdk"].map((name) => [
    name,
    internalDependencies(
      JSON.parse(
        readFileSync(path.join(REPO, "packages", name, "package.json"), "utf8"),
      ),
    ) as string[],
  ]),
);

/** The packages a step's `for name in ...; do` loop visits first, in order. */
function packageOrderOf(jobName: string, stepName: string): string[] {
  const script = stepScript(
    jobLinesOf(
      readFileSync(path.join(REPO, RELEASE_WORKFLOW), "utf8"),
      jobName,
    ).join("\n"),
    stepName,
  );
  const loop = /for name in ([^;\n]+); do/.exec(script);
  expect(loop, stepName).not.toBeNull();
  return (loop?.[1] ?? "").trim().split(/\s+/);
}

describe("the order the publishing steps visit the packages in", () => {
  for (const [jobName, stepName] of [
    [NPM_JOB, "Publish the packages"],
    ["rehearse", "Dry-run the publishing"],
  ]) {
    it(`lists exactly the six packages in ${jobName}, each after everything it depends on, which the single-pass skip needs`, () => {
      const order = packageOrderOf(jobName, stepName);
      expect([...order].sort()).toEqual(Object.keys(DEPENDENCIES).sort());
      for (const [name, dependencies] of Object.entries(DEPENDENCIES)) {
        for (const dependency of dependencies) {
          expect(
            order.indexOf(dependency.replace("@mapcairn/", "")),
            `${dependency} before ${name}`,
          ).toBeLessThan(order.indexOf(name));
        }
      }
    });
  }
});

describe.skipIf(process.platform === "win32")(
  "the publishing step of the npm job, run with a fake npm and a fake registry",
  () => {
    const tarball = (name: string) =>
      `<workspace>/release/mapcairn-${name}-0.1.0-rc.2.tgz`;

    it("publishes core, react, theme, map, adapter-maplibre and sdk in that order, and reads each back before the next", () => {
      const run = runPublishStep({ mode: "publish", states: ALL_MISSING });
      expect(run.status).toBe(0);
      expect(actions(run)).toEqual(
        ["core", "react", "theme", "map", "adapter-maplibre", "sdk"].flatMap(
          (name) => [
            `npm publish ${tarball(name)} --ignore-scripts --tag next --provenance`,
            `node scripts/release/verifyRelease.mjs confirm-published @mapcairn/${name} 0.1.0-rc.2`,
          ],
        ),
      );
    });

    it("finishes a half-published set on a re-run: what is on npm is skipped with a notice, and the rest is published", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "published",
          react: "published",
          theme: "missing",
          map: "missing",
          "adapter-maplibre": "missing",
          sdk: "missing",
        },
      });
      expect(run.status).toBe(0);
      expect(actions(run).filter((call) => call.startsWith("npm "))).toEqual([
        `npm publish ${tarball("theme")} --ignore-scripts --tag next --provenance`,
        `npm publish ${tarball("map")} --ignore-scripts --tag next --provenance`,
        `npm publish ${tarball("adapter-maplibre")} --ignore-scripts --tag next --provenance`,
        `npm publish ${tarball("sdk")} --ignore-scripts --tag next --provenance`,
      ]);
      expect(run.stdout).toContain(
        "::notice::@mapcairn/core@0.1.0-rc.2 is already on npm",
      );
      expect(run.stdout).toContain(
        "::notice::@mapcairn/react@0.1.0-rc.2 is already on npm",
      );
    });

    it("publishes nothing and succeeds when every package is already on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "published",
          react: "published",
          theme: "published",
          map: "published",
          "adapter-maplibre": "published",
          sdk: "published",
        },
      });
      expect(run.status).toBe(0);
      expect(actions(run)).toEqual([]);
    });

    it("stops at a registry answer that is neither found nor not found, before it publishes any package, because every state is read first", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, react: "error" },
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual([]);
    });

    it("stops when a publish fails, and publishes no later package", () => {
      const run = runPublishStep({
        mode: "publish",
        states: ALL_MISSING,
        publishFails: ["theme"],
      });
      expect(run.status).not.toBe(0);
      const published = actions(run).filter((call) => call.startsWith("npm "));
      expect(published).toHaveLength(3);
      expect(published.join("\n")).not.toContain("mapcairn-map-");
    });

    it("stops when the publish of the hyphenated adapter fails, and publishes nothing after it", () => {
      const run = runPublishStep({
        mode: "publish",
        states: ALL_MISSING,
        publishFails: ["adapter-maplibre"],
      });
      expect(run.status).not.toBe(0);
      const published = actions(run).filter((call) => call.startsWith("npm "));
      expect(published).toHaveLength(5);
      expect(published.join("\n")).toContain("mapcairn-adapter-maplibre-");
      expect(published.join("\n")).not.toContain("mapcairn-sdk-");
    });

    it("stops when a published version does not appear on the registry", () => {
      const run = runPublishStep({
        mode: "publish",
        states: ALL_MISSING,
        confirmFails: ["react"],
      });
      expect(run.status).not.toBe(0);
      const published = actions(run).filter((call) => call.startsWith("npm "));
      expect(published).toHaveLength(2);
    });

    it("publishes the packages npm has and then fails, naming the one it does not have and what to do, when one is new and the rest are on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, theme: "new" },
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual(
        ["core", "react", "map", "adapter-maplibre", "sdk"].flatMap((name) => [
          `npm publish ${tarball(name)} --ignore-scripts --tag next --provenance`,
          `node scripts/release/verifyRelease.mjs confirm-published @mapcairn/${name} 0.1.0-rc.2`,
        ]),
      );
      expect(run.stdout).toContain("::error::");
      expect(run.stdout).toContain("@mapcairn/theme is not on npm yet");
      expect(run.stdout).toContain("by hand");
      expect(run.stdout).toContain("two-factor authentication");
      expect(run.stdout).toContain("disallow tokens");
      expect(run.stdout).toContain("Re-run failed jobs");
      expect(run.stdout).toContain(
        "link its trusted publisher when the next Release pull request is ready",
      );
    });

    it("fails and publishes nothing when one package is new and the others are already on npm at this version", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "published",
          react: "published",
          theme: "published",
          map: "new",
          "adapter-maplibre": "published",
          sdk: "published",
        },
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual([]);
      expect(run.stdout).toContain("@mapcairn/map is not on npm yet");
    });

    it("names every new package, publishes none of them, and fails when no package is on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "new",
          react: "new",
          theme: "new",
          map: "new",
          "adapter-maplibre": "new",
          sdk: "new",
        },
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual([]);
      for (const name of [
        "core",
        "react",
        "theme",
        "map",
        "adapter-maplibre",
        "sdk",
      ]) {
        expect(run.stdout).toContain(`@mapcairn/${name}`);
      }
    });

    it("still stops at a registry error after a new package, and publishes nothing", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, core: "new", react: "error" },
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual([]);
    });

    it("warns about a new package in a rehearsal, dry-runs the rest and does not fail, since nothing is published", () => {
      const run = runPublishStep({
        mode: "rehearse",
        states: { ...ALL_MISSING, map: "new" },
      });
      expect(run.status).toBe(0);
      expect(actions(run)).toEqual(
        ["core", "react", "theme", "adapter-maplibre", "sdk"].map(
          (name) =>
            `npm publish ${tarball(name)} --ignore-scripts --tag next --provenance --dry-run`,
        ),
      );
      expect(run.stdout).toContain(
        "::warning::@mapcairn/map is not on npm yet",
      );
      expect(run.stdout).toContain(
        "it also skips the packages that depend on it, which this rehearsal dry-runs",
      );
      expect(run.stdout).toContain("by hand");
    });

    it("publishes only the packages that do not depend on a new core, skips the dependents naming each, and fails", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, core: "new" },
        dependencies: DEPENDENCIES,
      });
      expect(run.status).not.toBe(0);
      expect(publishedTarballs(run)).toEqual([
        tarball("react"),
        tarball("theme"),
      ]);
      expect(run.stdout).not.toContain("::error::@mapcairn/react depends");
      expect(run.stdout).toContain(
        "::error::@mapcairn/map depends on @mapcairn/core",
      );
      expect(run.stdout).toContain(
        "::error::@mapcairn/adapter-maplibre depends on @mapcairn/core",
      );
      expect(run.stdout).toContain(
        "::error::@mapcairn/sdk depends on @mapcairn/core",
      );
      expect(run.stdout).not.toContain("::error::@mapcairn/theme depends");
      expect(run.stdout).toContain("@mapcairn/core is not on npm yet");
      expect(run.stdout).toContain("by hand");
    });

    it("publishes nothing and fails when a tarball's dependencies cannot be read, so a failed read is never taken for no dependencies", () => {
      const run = runPublishStep({
        mode: "publish",
        states: ALL_MISSING,
        dependenciesFail: ["react"],
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual([]);
    });

    it("publishes the five others and then fails for the umbrella when it is new, since nothing depends on it", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, sdk: "new" },
        dependencies: {
          core: [],
          react: ["@mapcairn/core"],
          theme: [],
          map: ["@mapcairn/core", "@mapcairn/react", "@mapcairn/theme"],
          "adapter-maplibre": ["@mapcairn/core", "@mapcairn/theme"],
        },
      });
      expect(run.status).not.toBe(0);
      expect(
        actions(run)
          .filter((call) => call.startsWith("npm "))
          .map((call) => call.split(" ")[2]),
      ).toEqual([
        tarball("core"),
        tarball("react"),
        tarball("theme"),
        tarball("map"),
        tarball("adapter-maplibre"),
      ]);
      expect(run.stdout).toContain("@mapcairn/sdk is not on npm yet");
      expect(run.stdout).not.toContain("depends on");
    });

    it("publishes the four others and then fails naming both the adapter and the umbrella when both are new, as in rc.3, since neither is pinned by a package the job publishes", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, "adapter-maplibre": "new", sdk: "new" },
        dependencies: {
          core: [],
          react: ["@mapcairn/core"],
          theme: [],
          map: ["@mapcairn/core", "@mapcairn/react", "@mapcairn/theme"],
        },
      });
      expect(run.status).not.toBe(0);
      expect(
        actions(run)
          .filter((call) => call.startsWith("npm "))
          .map((call) => call.split(" ")[2]),
      ).toEqual([
        tarball("core"),
        tarball("react"),
        tarball("theme"),
        tarball("map"),
      ]);
      expect(run.stdout).toContain(
        "@mapcairn/adapter-maplibre is not on npm yet",
      );
      expect(run.stdout).toContain("@mapcairn/sdk is not on npm yet");
      expect(run.stdout).not.toContain("depends on");
    });

    it("publishes core, react, theme and map, skips the umbrella and fails naming both, when the adapter is new and the umbrella that pins it is not on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, "adapter-maplibre": "new" },
        dependencies: DEPENDENCIES,
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual(
        ["core", "react", "theme", "map"].flatMap((name) => [
          `npm publish ${tarball(name)} --ignore-scripts --tag next --provenance`,
          `node scripts/release/verifyRelease.mjs confirm-published @mapcairn/${name} 0.1.0-rc.2`,
        ]),
      );
      expect(run.stdout).toContain(
        "::error::@mapcairn/sdk depends on @mapcairn/adapter-maplibre",
      );
      expect(run.stdout).toContain(
        "@mapcairn/adapter-maplibre is not on npm yet",
      );
      expect(run.stdout).not.toContain("::error::@mapcairn/map depends");
    });

    it("publishes the dependent on a re-run, once the new package it pins is on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "published",
          react: "published",
          theme: "published",
          map: "published",
          "adapter-maplibre": "published",
          sdk: "missing",
        },
        dependencies: DEPENDENCIES,
      });
      expect(run.status).toBe(0);
      expect(publishedTarballs(run)).toEqual([tarball("sdk")]);
      expect(run.stdout).not.toContain("::error::");
    });

    it("skips a dependent of a skipped package too, so a package never pins a version that is not on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "published",
          react: "missing",
          theme: "new",
          map: "missing",
          "adapter-maplibre": "missing",
          sdk: "missing",
        },
        dependencies: DEPENDENCIES,
      });
      expect(run.status).not.toBe(0);
      expect(publishedTarballs(run)).toEqual([tarball("react")]);
      expect(run.stdout).toContain(
        "::error::@mapcairn/map depends on @mapcairn/theme, which is not on npm yet",
      );
      expect(run.stdout).toContain(
        "::error::@mapcairn/sdk waits for @mapcairn/map, which is skipped; the re-run publishes both once the new package is on npm",
      );
      expect(run.stdout).not.toContain(
        "::error::@mapcairn/sdk depends on @mapcairn/map",
      );
    });

    it("skips nothing and prints no dependency line when nothing is new and every package is on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: Object.fromEntries(
          Object.keys(ALL_MISSING).map((name) => [name, "published"]),
        ),
        dependencies: DEPENDENCIES,
      });
      expect(run.status).toBe(0);
      expect(actions(run)).toEqual([]);
      expect(run.stdout).not.toContain("depends on");
      expect(run.stdout).not.toContain("waits for");
    });

    it("publishes nothing and fails, naming the umbrella, when it is new and the others are already on npm", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "published",
          react: "published",
          theme: "published",
          map: "published",
          "adapter-maplibre": "published",
          sdk: "new",
        },
      });
      expect(run.status).not.toBe(0);
      expect(actions(run)).toEqual([]);
      expect(run.stdout).toContain("@mapcairn/sdk is not on npm yet");
      expect(run.stdout).toContain("by hand");
    });

    it("skips every package that depends on a new theme, and publishes react, which does not", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, theme: "new", core: "published" },
        dependencies: DEPENDENCIES,
      });
      expect(run.status).not.toBe(0);
      expect(publishedTarballs(run)).toEqual([tarball("react")]);
      expect(run.stdout).toContain(
        "::error::@mapcairn/sdk depends on @mapcairn/theme",
      );
    });

    it("stops at a failed publish and publishes nothing after it, even when a dependent was skipped earlier in the loop", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, theme: "new" },
        dependencies: DEPENDENCIES,
        publishFails: ["react"],
      });
      expect(run.status).not.toBe(0);
      expect(publishedTarballs(run)).toEqual([
        tarball("core"),
        tarball("react"),
      ]);
    });

    it("does not refuse when the dependents of a new package are already on npm at this version", () => {
      const run = runPublishStep({
        mode: "publish",
        states: {
          core: "new",
          react: "published",
          theme: "missing",
          map: "published",
          "adapter-maplibre": "published",
          sdk: "published",
        },
        dependencies: {
          react: ["@mapcairn/core"],
          theme: [],
          map: ["@mapcairn/core"],
          sdk: ["@mapcairn/core"],
        },
      });
      expect(run.status).not.toBe(0);
      expect(
        actions(run).filter((call) => call.startsWith("npm ")),
      ).toHaveLength(1);
      expect(run.stdout).not.toContain("depends on");
    });

    it("names a new package when it is found, so a later failure of a publish does not leave it unnamed", () => {
      const run = runPublishStep({
        mode: "publish",
        states: { ...ALL_MISSING, core: "new" },
        publishFails: ["react"],
      });
      expect(run.status).not.toBe(0);
      expect(run.stdout).toContain("@mapcairn/core is not on npm yet");
    });

    it("makes a rehearsal a dry run: it adds --dry-run and does not read the registry back", () => {
      const run = runPublishStep({ mode: "rehearse", states: ALL_MISSING });
      expect(run.status).toBe(0);
      expect(actions(run)).toEqual(
        ["core", "react", "theme", "map", "adapter-maplibre", "sdk"].map(
          (name) =>
            `npm publish ${tarball(name)} --ignore-scripts --tag next --provenance --dry-run`,
        ),
      );
    });

    it("still skips what is on npm in a rehearsal", () => {
      const run = runPublishStep({
        mode: "rehearse",
        states: { ...ALL_MISSING, core: "published" },
      });
      expect(
        actions(run).filter((call) => call.includes("mapcairn-core-")),
      ).toEqual([]);
    });

    it("publishes under the dist-tag it is given, so an older version never takes next or latest", () => {
      const run = runPublishStep({
        mode: "publish",
        states: ALL_MISSING,
        version: "0.1.0-rc.2",
        distTag: "previous",
      });
      expect(
        actions(run)
          .filter((call) => call.startsWith("npm "))
          .every((call) => call.includes("--tag previous")),
      ).toBe(true);
    });
  },
);
