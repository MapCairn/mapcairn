// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Works out which files the sync owns and what they should contain. The
 * sources are `.claude/skills` and `.claude/agents`; everything under the
 * output folders in `OWNED_DIRECTORIES` is generated and is replaced or
 * removed to match. Files are copied, never linked, so it works on Windows.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  isPortable,
  parseAgent,
  renderCodex,
  renderCopilot,
  renderOpencode,
} from "./render.mjs";
import { checkSkill } from "./skills.mjs";

const SKILLS_SOURCE = ".claude/skills";
const AGENTS_SOURCE = ".claude/agents";

/** Where each generated agent file goes, and how it is rendered. */
const AGENT_TARGETS = [
  { directory: ".opencode/agents", extension: ".md", render: renderOpencode },
  { directory: ".codex/agents", extension: ".toml", render: renderCodex },
  {
    directory: ".github/agents",
    extension: ".agent.md",
    render: renderCopilot,
  },
];

/** Folders the sync writes to. Nothing else in the repository is touched. */
export const OWNED_DIRECTORIES = [
  ".agents/skills",
  ...AGENT_TARGETS.map(({ directory }) => directory),
];

/**
 * The entries of a directory, or none when it does not exist.
 *
 * @param {string} root
 * @param {string} directory Relative to `root`.
 * @returns {import("node:fs").Dirent[]}
 */
function entriesOf(root, directory) {
  const base = path.join(root, directory);
  return existsSync(base) ? readdirSync(base, { withFileTypes: true }) : [];
}

/**
 * Every file under a directory, as paths relative to `root` with forward slashes.
 *
 * @param {string} root
 * @param {string} directory
 * @returns {string[]}
 */
function filesUnder(root, directory) {
  return entriesOf(root, directory).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(root, relative) : [relative];
  });
}

/**
 * The names of the skill folders, sorted.
 *
 * @param {string} root
 * @returns {string[]}
 */
function skillFolders(root) {
  return entriesOf(root, SKILLS_SOURCE)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Checks every skill in `.claude/skills` and returns one line per problem.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function skillProblems(root) {
  return skillFolders(root).flatMap((folder) => {
    const file = path.join(root, SKILLS_SOURCE, folder, "SKILL.md");
    if (!existsSync(file)) {
      return [`${SKILLS_SOURCE}/${folder}: SKILL.md is missing`];
    }
    return checkSkill(folder, readFileSync(file, "utf8")).map(
      (problem) => `${SKILLS_SOURCE}/${folder}/SKILL.md: ${problem}`,
    );
  });
}

/**
 * The files the sync should produce: a byte-for-byte copy of each skill folder
 * (as `Buffer`s) and one file per portable agent in each tool's format (as
 * strings), keyed by path relative to `root`.
 *
 * @param {string} root
 * @returns {Map<string, Buffer | string>}
 */
export function plannedFiles(root) {
  /** @type {Map<string, Buffer | string>} */
  const plan = new Map();
  for (const folder of skillFolders(root)) {
    for (const file of filesUnder(root, `${SKILLS_SOURCE}/${folder}`)) {
      const target = file.replace(SKILLS_SOURCE, ".agents/skills");
      plan.set(target, readFileSync(path.join(root, file)));
    }
  }
  const agentFiles = entriesOf(root, AGENTS_SOURCE)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .filter(isPortable)
    .sort();
  for (const filename of agentFiles) {
    const text = readFileSync(path.join(root, AGENTS_SOURCE, filename), "utf8");
    const agent = parseAgent(filename, text);
    for (const { directory, extension, render } of AGENT_TARGETS) {
      plan.set(`${directory}/${agent.name}${extension}`, render(agent));
    }
  }
  return plan;
}

/**
 * Whether a file on disk already holds the planned content. Generated text is
 * compared with line endings normalised, copied files byte for byte.
 *
 * @param {string} file Absolute path.
 * @param {Buffer | string} wanted
 * @returns {boolean}
 */
function matches(file, wanted) {
  const actual = readFileSync(file);
  if (typeof wanted === "string") {
    return actual.toString("utf8").replaceAll("\r\n", "\n") === wanted;
  }
  return actual.equals(wanted);
}

/**
 * Compares the plan with what is on disk in the owned folders.
 *
 * @param {string} root
 * @param {Map<string, Buffer | string>} plan
 * @returns {{ missing: string[], changed: string[], extra: string[] }}
 */
export function findDrift(root, plan) {
  const missing = [];
  const changed = [];
  for (const [file, wanted] of plan) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) {
      missing.push(file);
    } else if (!matches(absolute, wanted)) {
      changed.push(file);
    }
  }
  const extra = OWNED_DIRECTORIES.flatMap((directory) =>
    filesUnder(root, directory),
  ).filter((file) => !plan.has(file));
  return {
    missing: missing.sort(),
    changed: changed.sort(),
    extra: extra.sort(),
  };
}

/**
 * Removes a file and then any parent folder it leaves empty, up to the root.
 *
 * @param {string} root
 * @param {string} file
 */
function removeFile(root, file) {
  rmSync(path.join(root, file));
  for (
    let directory = path.dirname(file);
    directory !== "." && readdirSync(path.join(root, directory)).length === 0;
    directory = path.dirname(directory)
  ) {
    rmSync(path.join(root, directory), { recursive: true });
  }
}

/**
 * Makes the owned folders match the plan: writes missing and changed files and
 * removes the ones the plan does not name.
 *
 * @param {string} root
 * @param {Map<string, Buffer | string>} plan
 */
export function writePlan(root, plan) {
  const { missing, changed, extra } = findDrift(root, plan);
  for (const file of extra) {
    removeFile(root, file);
  }
  for (const file of [...missing, ...changed]) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, plan.get(file) ?? "");
  }
}
