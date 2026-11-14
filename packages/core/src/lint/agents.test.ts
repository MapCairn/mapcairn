// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error The agent scripts are dependency-free JavaScript with JSDoc types.
import {
  findDrift,
  plannedFiles,
  skillProblems,
  writePlan,
} from "../../../../scripts/agents/plan.mjs";
import {
  parseAgent,
  renderCodex,
  renderCopilot,
  renderOpencode,
  renderQwen,
  // @ts-expect-error The agent scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/render.mjs";
import {
  CLAUDE_ONLY_TOOL_NAMES,
  checkSkill,
  parseFrontmatter,
  // @ts-expect-error The agent scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/agents/skills.mjs";

const skill = (fields: string, body = "Body.\n"): string =>
  `---\n${fields}\n---\n\n${body}`;

describe("parseFrontmatter", () => {
  it("reads plain and double-quoted single-line fields", () => {
    const parsed = parseFrontmatter(
      skill('name: a-skill\ndescription: "Does a thing: well"'),
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual({
      name: "a-skill",
      description: "Does a thing: well",
    });
    expect(parsed.body).toBe("\nBody.\n");
  });

  it("reads single-quoted values", () => {
    const parsed = parseFrontmatter(
      skill("name: it's\ndescription: 'It''s: ok'"),
    );
    expect(parsed.fields.description).toBe("It's: ok");
  });

  it("reports text with no frontmatter", () => {
    expect(parseFrontmatter("# Title\n").problems).toEqual([
      "the file does not start with a frontmatter block",
    ]);
  });

  it("reports a frontmatter block that never closes", () => {
    expect(parseFrontmatter("---\nname: a\n").problems).toEqual([
      "the frontmatter block is not closed",
    ]);
  });

  it("reports a plain value that strict YAML rejects", () => {
    const parsed = parseFrontmatter(
      skill("name: a\ndescription: Take it with the gh CLI: claim it"),
    );
    expect(parsed.problems).toEqual([
      'description: a plain value cannot contain ": " (quote the value)',
    ]);
  });

  it("reports a plain value that holds a comment marker", () => {
    const parsed = parseFrontmatter(skill("name: a\ndescription: Fix it #12"));
    expect(parsed.problems).toEqual([
      'description: a plain value cannot contain " #" (quote the value)',
    ]);
  });

  it("reports a plain value that starts with a YAML indicator", () => {
    const parsed = parseFrontmatter(skill("name: a\ndescription: [x] it"));
    expect(parsed.problems).toEqual([
      "description: a plain value cannot start with [ (quote the value)",
    ]);
  });

  it("reports a line that is not a single-line field", () => {
    const parsed = parseFrontmatter(skill("name: a\n  continued"));
    expect(parsed.problems).toEqual([
      'unsupported frontmatter line "  continued": use one "key: value" per line',
    ]);
  });

  it("reports a broken double-quoted value", () => {
    const parsed = parseFrontmatter(skill('name: a\ndescription: "unclosed'));
    expect(parsed.problems).toEqual([
      "description: the double-quoted value is not valid",
    ]);
  });
});

describe("checkSkill", () => {
  const good = skill("name: pick-up\ndescription: Does a thing.");

  it("accepts a well-formed skill", () => {
    expect(checkSkill("pick-up", good)).toEqual([]);
  });

  it("requires the name to equal the folder", () => {
    expect(checkSkill("other", good)).toEqual([
      'name "pick-up" must equal its folder "other"',
    ]);
  });

  it("requires lowercase kebab-case", () => {
    expect(
      checkSkill("Pick_Up", skill("name: Pick_Up\ndescription: x")),
    ).toEqual(['name "Pick_Up" must be lowercase kebab-case']);
  });

  it("limits the name to 64 characters", () => {
    const name = "a".repeat(65);
    expect(checkSkill(name, skill(`name: ${name}\ndescription: x`))).toEqual([
      "name is 65 characters; the limit is 64",
    ]);
  });

  it("requires a name and a description", () => {
    expect(checkSkill("a", skill("other: x"))).toEqual([
      "name is missing",
      "description is missing",
    ]);
  });

  it("limits the description to 1024 characters", () => {
    const description = "d".repeat(1025);
    expect(
      checkSkill("a", skill(`name: a\ndescription: ${description}`)),
    ).toEqual(["description is 1025 characters; the limit is 1024"]);
  });

  it("accepts a description of exactly 1024 characters", () => {
    const description = "d".repeat(1024);
    expect(
      checkSkill("a", skill(`name: a\ndescription: ${description}`)),
    ).toEqual([]);
  });

  it.each(CLAUDE_ONLY_TOOL_NAMES as string[])(
    "rejects the Claude-only name %s in the body",
    (token) => {
      const text = skill("name: a\ndescription: x", `Call ${token} here.\n`);
      expect(checkSkill("a", text)).toEqual([
        `the body names a Claude-only tool or feature: ${token}`,
      ]);
    },
  );

  it("allows a Claude-only name in the frontmatter, which is not the body", () => {
    expect(
      checkSkill("a", skill('name: a\ndescription: "Runs TodoWrite for you"')),
    ).toEqual([]);
  });

  it("allows ordinary words that the deny list does not name", () => {
    const text = skill(
      "name: a\ndescription: x",
      "Start a Workflow instance and read the Agent class.\n",
    );
    expect(checkSkill("a", text)).toEqual([]);
  });
});

const agent = (fields: string, body = "You do one job.\n"): string =>
  `---\n${fields}\n---\n\n${body}`;

const reviewer = agent(
  [
    "name: fresh-eyes-reviewer",
    "description: Reviews a diff. Give it a number.",
    "tools: Glob, Grep, Read, Bash",
    "model: sonnet",
    "color: yellow",
  ].join("\n"),
  "Read `AGENTS.md`, then say \"no findings\" or list them.\nBackslash \\ and 'quotes'.\n",
);

describe("agent rendering", () => {
  const parsed = parseAgent("fresh-eyes-reviewer.md", reviewer);

  it("parses the name, description and body", () => {
    expect(parsed.name).toBe("fresh-eyes-reviewer");
    expect(parsed.description).toBe("Reviews a diff. Give it a number.");
    expect(parsed.body.startsWith("Read `AGENTS.md`")).toBe(true);
  });

  it("rejects a file whose name differs from its filename", () => {
    expect(() => parseAgent("other.md", reviewer)).toThrow(
      /name "fresh-eyes-reviewer" must equal its filename "other"/,
    );
  });

  it("rejects an agent with no description", () => {
    expect(() => parseAgent("a.md", agent("name: a"))).toThrow(
      /a\.md: name and description are required/,
    );
  });

  it("renders the opencode format as a subagent with no tools or model", () => {
    expect(renderOpencode(parsed)).toBe(
      [
        "---",
        'description: "Reviews a diff. Give it a number."',
        "mode: subagent",
        "---",
        "",
        "<!-- Generated by `npm run agents:sync` from .claude/agents/fresh-eyes-reviewer.md. Edit that file, not this one. -->",
        "",
        parsed.body,
      ].join("\n"),
    );
  });

  it("renders the Copilot format with a name and description", () => {
    const text = renderCopilot(parsed);
    expect(
      text.startsWith(
        '---\nname: "fresh-eyes-reviewer"\ndescription: "Reviews a diff. Give it a number."\n---\n',
      ),
    ).toBe(true);
    expect(text).not.toMatch(/^tools:|^model:/m);
    expect(text).toContain("Edit that file, not this one.");
  });

  it("renders the Qwen Code format with a name and description and no tools or model", () => {
    const text = renderQwen(parsed);
    expect(
      text.startsWith(
        '---\nname: "fresh-eyes-reviewer"\ndescription: "Reviews a diff. Give it a number."\n---\n',
      ),
    ).toBe(true);
    expect(text).not.toMatch(/^tools:|^model:|^approvalMode:/m);
    expect(text).toContain("Edit that file, not this one.");
    expect(text.endsWith(parsed.body)).toBe(true);
  });

  it("renders the Codex format as TOML with the body as a literal string", () => {
    const text = renderCodex(parsed);
    expect(text).toContain('name = "fresh-eyes-reviewer"');
    expect(text).toContain('description = "Reviews a diff. Give it a number."');
    expect(text).toContain(`developer_instructions = '''\n${parsed.body}'''`);
    expect(text.startsWith("# Generated by `npm run agents:sync`")).toBe(true);
    expect(text).not.toMatch(/^model|^sandbox_mode/m);
  });

  it("refuses a body that would end a TOML literal string", () => {
    const bad = parseAgent(
      "a.md",
      agent("name: a\ndescription: x", "It has ''' in it.\n"),
    );
    expect(() => renderCodex(bad)).toThrow(
      /cannot be written as a TOML literal string/,
    );
  });

  it.each(CLAUDE_ONLY_TOOL_NAMES as string[])(
    "rejects the Claude-only name %s in an agent body",
    (token) => {
      expect(() =>
        parseAgent(
          "a.md",
          agent("name: a\ndescription: x", `Use ${token} here.\n`),
        ),
      ).toThrow(`a.md: the body names a Claude-only tool or feature: ${token}`);
    },
  );
});

describe("mirror planning", () => {
  let root: string;

  const put = (file: string, text: string | Buffer): void => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "agents-sync-"));
    put(".claude/skills/alpha/SKILL.md", skill("name: alpha\ndescription: A."));
    put(".claude/skills/alpha/references/notes.md", "notes\n");
    put(
      ".claude/skills/alpha/references/bin.dat",
      Buffer.from([0, 255, 13, 10]),
    );
    put(".claude/agents/helper.md", agent("name: helper\ndescription: Helps."));
    put(
      ".claude/agents/playwright-test-healer.md",
      agent("name: playwright-test-healer\ndescription: Heals."),
    );
    put(".github/workflows/ci.yml", "name: ci\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("plans a byte-for-byte skill mirror and the generated agent files, for every agent whatever its name", () => {
    const plan = plannedFiles(root);
    expect([...plan.keys()].sort()).toEqual([
      ".agents/skills/alpha/SKILL.md",
      ".agents/skills/alpha/references/bin.dat",
      ".agents/skills/alpha/references/notes.md",
      ".codex/agents/helper.toml",
      ".codex/agents/playwright-test-healer.toml",
      ".github/agents/helper.agent.md",
      ".github/agents/playwright-test-healer.agent.md",
      ".opencode/agents/helper.md",
      ".opencode/agents/playwright-test-healer.md",
      ".qwen/agents/helper.md",
      ".qwen/agents/playwright-test-healer.md",
    ]);
    expect(plan.get(".agents/skills/alpha/references/bin.dat")).toEqual(
      Buffer.from([0, 255, 13, 10]),
    );
  });

  it("reports every planned file as missing before the first sync", () => {
    const drift = findDrift(root, plannedFiles(root));
    expect(drift.missing).toHaveLength(11);
    expect(drift.changed).toEqual([]);
    expect(drift.extra).toEqual([]);
  });

  it("writes the plan and then finds no drift", () => {
    writePlan(root, plannedFiles(root));
    expect(findDrift(root, plannedFiles(root))).toEqual({
      missing: [],
      changed: [],
      extra: [],
    });
    expect(
      readFileSync(path.join(root, ".agents/skills/alpha/SKILL.md"), "utf8"),
    ).toBe(skill("name: alpha\ndescription: A."));
  });

  it("finds a changed mirror file and a deleted one", () => {
    writePlan(root, plannedFiles(root));
    put(".agents/skills/alpha/SKILL.md", "edited\n");
    rmSync(path.join(root, ".opencode/agents/helper.md"));
    const drift = findDrift(root, plannedFiles(root));
    expect(drift.changed).toEqual([".agents/skills/alpha/SKILL.md"]);
    expect(drift.missing).toEqual([".opencode/agents/helper.md"]);
  });

  it("finds a stale file in a folder the sync owns and removes it on write", () => {
    writePlan(root, plannedFiles(root));
    put(".agents/skills/gone/SKILL.md", "stale\n");
    put(".codex/agents/old.toml", "stale\n");
    expect(findDrift(root, plannedFiles(root)).extra).toEqual([
      ".agents/skills/gone/SKILL.md",
      ".codex/agents/old.toml",
    ]);
    writePlan(root, plannedFiles(root));
    expect(findDrift(root, plannedFiles(root)).extra).toEqual([]);
  });

  it("leaves other files in .github alone", () => {
    writePlan(root, plannedFiles(root));
    expect(
      readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8"),
    ).toBe("name: ci\n");
    expect(findDrift(root, plannedFiles(root)).extra).toEqual([]);
  });

  it("treats a CRLF copy of a generated text file as unchanged", () => {
    writePlan(root, plannedFiles(root));
    const file = path.join(root, ".opencode/agents/helper.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
    expect(findDrift(root, plannedFiles(root)).changed).toEqual([]);
  });

  it("plans nothing for a repository with no skills or agents", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "agents-empty-"));
    try {
      expect(plannedFiles(empty).size).toBe(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("finds a hand-edited generated agent file", () => {
    writePlan(root, plannedFiles(root));
    put(".codex/agents/helper.toml", "name = 'edited'\n");
    expect(findDrift(root, plannedFiles(root)).changed).toEqual([
      ".codex/agents/helper.toml",
    ]);
  });

  it("removes a stale folder but keeps the owned folder itself", () => {
    const stale = mkdtempSync(path.join(tmpdir(), "agents-stale-"));
    try {
      mkdirSync(path.join(stale, ".agents/skills/gone"), { recursive: true });
      writeFileSync(path.join(stale, ".agents/skills/gone/SKILL.md"), "old\n");
      writePlan(stale, new Map());
      expect(existsSync(path.join(stale, ".agents/skills/gone"))).toBe(false);
      expect(existsSync(path.join(stale, ".agents/skills"))).toBe(true);
    } finally {
      rmSync(stale, { recursive: true, force: true });
    }
  });

  it("copies project skills only, and leaves vendored ones out", () => {
    put(
      ".claude/skills/vendored/SKILL.md",
      skill("name: vendored\ndescription: V."),
    );
    put(
      "skills-lock.json",
      JSON.stringify({ version: 1, skills: { vendored: {} } }),
    );
    const files = [...plannedFiles(root).keys()];
    expect(files.some((file) => file.includes("vendored"))).toBe(false);
    expect(files).toContain(".agents/skills/alpha/SKILL.md");
  });

  it("does not hold a vendored skill to the project rules", () => {
    put(".claude/skills/vendored/SKILL.md", "no frontmatter\n");
    put("skills-lock.json", JSON.stringify({ skills: { vendored: {} } }));
    expect(skillProblems(root)).toEqual([]);
  });

  it("treats a lock file with no skills as naming none", () => {
    put("skills-lock.json", JSON.stringify({ version: 1 }));
    expect(skillProblems(root)).toEqual([]);
    expect([...plannedFiles(root).keys()]).toContain(
      ".agents/skills/alpha/SKILL.md",
    );
  });

  it("holds a skill that is not in the lock file to the rules", () => {
    put(".claude/skills/other/SKILL.md", "no frontmatter\n");
    put("skills-lock.json", JSON.stringify({ skills: { vendored: {} } }));
    expect(skillProblems(root)).toContain(
      ".claude/skills/other/SKILL.md: the file does not start with a frontmatter block",
    );
  });
});

describe("skill problems", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "agents-problems-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports a missing skills folder", () => {
    expect(skillProblems(root)).toEqual([".claude/skills is missing"]);
  });

  it("reports a skill folder with no SKILL.md", () => {
    mkdirSync(path.join(root, ".claude/skills/empty"), { recursive: true });
    expect(skillProblems(root)).toEqual([
      ".claude/skills/empty: SKILL.md is missing",
    ]);
  });

  it("reports a symbolic link instead of skipping it", () => {
    mkdirSync(path.join(root, "elsewhere"), { recursive: true });
    mkdirSync(path.join(root, ".claude/skills"), { recursive: true });
    symlinkSync(
      path.join(root, "elsewhere"),
      path.join(root, ".claude/skills/linked"),
      "junction",
    );
    expect(skillProblems(root)).toEqual([
      ".claude/skills/linked: is a symbolic link; use a real folder, because the sync copies and never links",
    ]);
  });
});

describe("the command line", () => {
  const scripts = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../scripts/agents",
  );
  let root: string;
  let elsewhere: string;

  /** Runs the copied script from a directory that is not the repository root. */
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [path.join(root, "scripts/agents/sync.mjs"), ...args],
      { cwd: elsewhere, encoding: "utf8" },
    );

  const put = (file: string, text: string): void => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "agents-cli-"));
    elsewhere = mkdtempSync(path.join(tmpdir(), "agents-cwd-"));
    cpSync(scripts, path.join(root, "scripts/agents"), { recursive: true });
    put(".claude/skills/alpha/SKILL.md", skill("name: alpha\ndescription: A."));
    put(".claude/agents/helper.md", agent("name: helper\ndescription: Helps."));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it("writes under the repository root, not the working directory", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(existsSync(path.join(root, ".agents/skills/alpha/SKILL.md"))).toBe(
      true,
    );
    expect(existsSync(path.join(elsewhere, ".agents"))).toBe(false);
  });

  it("passes the check after a write, from another directory", () => {
    run();
    const result = run("--check");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("current");
  });

  it("fails the check before the first write and names the missing files", () => {
    const result = run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing  .agents/skills/alpha/SKILL.md");
  });

  it("fails the check for a hand-edited generated agent file", () => {
    run();
    put(".opencode/agents/helper.md", "edited\n");
    const result = run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("changed  .opencode/agents/helper.md");
  });

  it.each([[], ["--check"]])(
    "fails with %j when the skills folder is missing",
    (...args: string[]) => {
      rmSync(path.join(root, ".claude/skills"), { recursive: true });
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(".claude/skills is missing");
      expect(existsSync(path.join(root, ".agents"))).toBe(false);
    },
  );

  it.each([[], ["--check"]])(
    "fails with %j when there is nothing to generate",
    (...args: string[]) => {
      rmSync(path.join(root, ".claude/skills/alpha"), { recursive: true });
      rmSync(path.join(root, ".claude/agents"), { recursive: true });
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("nothing to generate");
    },
  );

  it("fails when a skill breaks a rule", () => {
    put(".claude/skills/alpha/SKILL.md", skill("name: wrong\ndescription: A."));
    const result = run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'name "wrong" must equal its folder "alpha"',
    );
  });
});
