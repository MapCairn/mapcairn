// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Works out which files the sync owns and what they should contain. The
 * sources are `.claude/skills` and `.claude/agents`; everything under the
 * output folders in `OWNED_DIRECTORIES` is generated and is replaced or
 * removed to match. Files are copied, never linked, so it works on Windows. The
 * skills named in `skills-lock.json` are mirrored too, so every tool reads them.
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
  parseAgent,
  renderCodex,
  renderCopilot,
  renderOpencode,
  renderQwen,
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
  { directory: ".qwen/agents", extension: ".md", render: renderQwen },
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
 * The skills installed from elsewhere, named in `skills-lock.json`. They are
 * not ours to rewrite, so they are not held to the project's skill rules, but
 * they are mirrored like the project's own so that every tool reads them.
 *
 * @param {string} root
 * @returns {Set<string>}
 */
function vendoredSkills(root) {
  const lock = path.join(root, "skills-lock.json");
  if (!existsSync(lock)) {
    return new Set();
  }
  const { skills = {} } = JSON.parse(readFileSync(lock, "utf8"));
  return new Set(Object.keys(skills));
}

/**
 * Every entry in `.claude/skills`, project and vendored, sorted by name.
 *
 * @param {string} root
 * @returns {import("node:fs").Dirent[]}
 */
function skillEntries(root) {
  return entriesOf(root, SKILLS_SOURCE).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * The names of the skills (project and vendored) that are real folders, sorted.
 * A skill the lock file names but whose folder is missing is not listed.
 *
 * @param {string} root
 * @returns {string[]}
 */
function skillFolders(root) {
  return skillEntries(root)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Checks every skill in `.claude/skills` and returns one line per problem. A
 * symbolic link is reported, not skipped, for a vendored skill as for a project
 * one: the sync copies and never links, so a linked skill would silently go
 * missing from the mirror. Only the project's own skills are held to the rest of
 * the skill rules.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function skillProblems(root) {
  if (!existsSync(path.join(root, SKILLS_SOURCE))) {
    return [`${SKILLS_SOURCE} is missing`];
  }
  const vendored = vendoredSkills(root);
  return skillEntries(root).flatMap((entry) => {
    const where = `${SKILLS_SOURCE}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      return [
        `${where}: is a symbolic link; use a real folder, because the sync copies and never links`,
      ];
    }
    if (!entry.isDirectory() || vendored.has(entry.name)) {
      return [];
    }
    const file = path.join(root, where, "SKILL.md");
    if (!existsSync(file)) {
      return [`${where}: SKILL.md is missing`];
    }
    return checkSkill(entry.name, readFileSync(file, "utf8")).map(
      (problem) => `${where}/SKILL.md: ${problem}`,
    );
  });
}

/**
 * The files the sync should produce, keyed by path relative to `root`: a
 * byte-for-byte copy of each skill folder, project and vendored (as `Buffer`s),
 * and one file per agent in each tool's format (as strings).
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
 * Removes a file and then any parent folder it leaves empty, stopping at the
 * owned folder it sits in, which stays.
 *
 * @param {string} root
 * @param {string} file
 */
function removeFile(root, file) {
  rmSync(path.join(root, file));
  const owned = OWNED_DIRECTORIES.find((directory) =>
    file.startsWith(`${directory}/`),
  );
  for (
    let directory = path.posix.dirname(file);
    directory !== owned && readdirSync(path.join(root, directory)).length === 0;
    directory = path.posix.dirname(directory)
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
