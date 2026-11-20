// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseChangelog,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/changelog.mjs";
import {
  checkChangelog,
  isShallowClone,
  runCheck,
  subjectsSincePreviousTag,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/notesCheck.mjs";

const PREAMBLE = "# Changelog\n\nWhat changed in each release.\n\n";

const GOOD = `${PREAMBLE}## 0.2.0 (2026-12-01)

### What is new

**Selecting several features.** You can now hold Shift and click to add features to a selection, and \`useFeatureSelection\` returns them all. ([#49](https://github.com/MapCairn/mapcairn/pull/49))

#### \`@mapcairn/theme\`

**Checking a theme.** \`checkThemeContrast\` reports the contrast of a proposed theme. ([#463](https://github.com/MapCairn/mapcairn/pull/463))

### What got better

- The scale bar no longer flickers while you zoom. ([#470](https://github.com/MapCairn/mapcairn/pull/470))

### What to change when you upgrade

**\`LayerKind\` has a new member.** A \`switch\` over it now needs an \`"image"\` case, because layers can now draw images. ([#480](https://github.com/MapCairn/mapcairn/pull/480))

Before:

\`\`\`ts
import type { LayerKind } from "@mapcairn/core";
switch (kind) {
  case "tiles":
    break;
}
\`\`\`

After:

\`\`\`ts
import type { LayerKind } from "@mapcairn/core";
switch (kind) {
  case "tiles":
    break;
  case "image":
    break;
}
\`\`\`

### Thanks

Thank you to \`octo-cat\` and plain-handle for their first contributions.
`;

function messages(text: string, options = {}): string[] {
  return checkChangelog(text, options).map(
    (finding: { message: string }) => finding.message,
  );
}

/** The bullet the tests below replace when they need a whole line. */
const BULLET_LINE =
  "- The scale bar no longer flickers while you zoom. ([#470](https://github.com/MapCairn/mapcairn/pull/470))";

/** Replaces one fragment of the good changelog, failing when it is not there. */
function edited(from: string, to: string): string {
  if (!GOOD.includes(from)) {
    throw new Error(`The good changelog has no ${from}`);
  }
  return GOOD.replace(from, to);
}

describe("checkChangelog", () => {
  it("passes the good changelog, an empty one and a title with an introduction", () => {
    expect(checkChangelog(GOOD)).toEqual([]);
    expect(checkChangelog(PREAMBLE)).toEqual([]);
    expect(checkChangelog("")).toEqual([]);
  });

  it("fails the bad example from the plan: a commit subject and a handle", () => {
    const bad = `${PREAMBLE}## 0.1.0 (2026-12-01)\n\n### What is new\n\n- feat(map): add multi-select (#412)\n- Huge DX improvements, thanks @some-handle!\n`;
    const found = checkChangelog(bad);
    expect(found.map((finding: { line: number }) => finding.line)).toEqual([
      9, 9, 10,
    ]);
    expect(messages(bad).join(" ")).toContain("commit subject");
    expect(messages(bad).join(" ")).toContain("notifies");
    expect(messages(bad).join(" ")).toContain("(#123)");
  });

  describe("commit prefixes", () => {
    it.each([
      "feat:",
      "fix(core):",
      "chore!:",
      "- docs(map)!:",
      "* perf:",
      "1. fix:",
      "12. feat(map)!:",
    ])("fails a line that starts with %s", (start) => {
      expect(
        messages(edited("- The scale bar", `${start} The scale bar`)),
      ).toContain(
        "A line that starts like a commit subject (`feat:`, `fix:` and so on) reads as a commit log. Say what someone can now do.",
      );
    });

    it("passes the same words inside a sentence or a code block", () => {
      expect(messages(edited("The scale bar", "A fix: the scale bar"))).toEqual(
        [],
      );
      expect(
        messages(edited(BULLET_LINE, "```text\nfix: the scale bar\n```")),
      ).toEqual([]);
    });
  });

  describe("handles", () => {
    it("fails an @handle outside a code span, in prose, a link text and a bold lead", () => {
      for (const bad of [
        "thanks @some-handle!",
        "[@some-handle](https://github.com/some-handle)",
        "**@octo** helped",
        "@octo",
      ]) {
        expect(messages(edited("The scale bar", bad)).join(" ")).toContain(
          "notifies",
        );
      }
    });

    it("passes a handle in a code span, written plainly, and a scoped package name", () => {
      for (const good of [
        "thanks `@some-handle`",
        "thanks some-handle",
        "see @mapcairn/map and @mapcairn/core/contracts",
        "`` @a `` and `b`",
      ]) {
        expect(messages(edited("The scale bar", good))).toEqual([]);
      }
    });

    it("fails a handle after a code span that is never closed", () => {
      for (const bad of ["`alice` and `@bob for the fix", "thanks `@bob"]) {
        expect(messages(edited("The scale bar", bad)).join(" ")).toContain(
          "notifies",
        );
      }
    });

    it("lets only the SDK package names stand outside a code span", () => {
      for (const bad of [
        "thanks @MapCairn/maintainers",
        "see @mapcairn/other",
        "see @mapcairn/map-extra",
        "see @mapcairn/adapter-maplibre-extra",
        "ask @mapcairn",
      ]) {
        expect(messages(edited("The scale bar", bad)).join(" ")).toContain(
          "notifies",
        );
      }
      for (const good of [
        "see `@MapCairn/maintainers`",
        "import from @mapcairn/theme/tokens.css",
        "@mapcairn/react and @mapcairn/core.",
        "import from @mapcairn/sdk/styles.css",
        "the adapter, @mapcairn/adapter-maplibre, and its @mapcairn/adapter-maplibre/styles.css",
        "import from @mapcairn/sdk/adapter-maplibre",
      ]) {
        expect(messages(edited("The scale bar", good))).toEqual([]);
      }
    });

    it("passes an import in a code block", () => {
      expect(GOOD).toContain('from "@mapcairn/core"');
      expect(messages(GOOD)).toEqual([]);
    });
  });

  describe("raw pull request tails", () => {
    it("fails a raw (#123) and passes a link to the pull request", () => {
      expect(
        messages(edited("The scale bar", "The scale bar (#123)")),
      ).toContain(
        "A raw `(#123)` tail comes from a commit subject. Link the pull request instead.",
      );
      expect(
        messages(
          edited(
            "The scale bar",
            "The scale bar ([#123](https://github.com/MapCairn/mapcairn/pull/123))",
          ),
        ),
      ).toEqual([]);
    });
  });

  describe("emoji and attribution", () => {
    it.each([
      ["\u{1F680}"],
      ["✨"],
      ["✅"],
      ["\u{1F44D}\u{1F3FD}"],
      ["1️⃣"],
      ["❤️"],
    ])("fails the emoji %s", (emoji) => {
      expect(
        messages(edited("The scale bar", `The scale bar ${emoji}`)),
      ).toContain("Emoji are not used in the notes.");
    });

    it("passes the check and cross marks, which are not emoji", () => {
      expect(
        messages(
          edited(
            "The scale bar",
            "Works \u2713, not \u2717, and \u2605 or \u260E",
          ),
        ),
      ).toEqual([]);
    });

    it("passes plain symbols that are not emoji", () => {
      expect(
        messages(edited("The scale bar", "The scale bar © ® ™ → é अ")),
      ).toEqual([]);
    });

    it.each([
      "Generated with a tool",
      "Co-Authored-By: Someone <a@b.example>",
      "Written by Claude",
      "drafted with an AI",
      "> Generated by a tool",
      "Generated with Claude Code",
    ])("fails the attribution %s", (line) => {
      expect(messages(edited("The scale bar", line))).toContain(
        "An attribution line does not belong in the notes.",
      );
    });

    it.each([
      "The API reports are generated by API Extractor.",
      "The file is generated with the build.",
      "- Written by the whole team.",
    ])("passes a sentence that only uses the words: %s", (line) => {
      expect(messages(edited("The scale bar", line))).toEqual([]);
    });

    it("looks for them inside code blocks too", () => {
      expect(
        messages(edited(BULLET_LINE, "```text\nGenerated with a tool\n```")),
      ).toContain("An attribution line does not belong in the notes.");
    });
  });

  describe("headings", () => {
    it("fails a heading the style guide does not name", () => {
      expect(
        messages(edited("### Thanks", "### Highlights")).join(" "),
      ).toContain("must be one of");
      expect(messages(edited("### Thanks", "## Thanks")).join(" ")).toContain(
        "## <version>",
      );
      expect(
        messages(edited("#### `@mapcairn/theme`", "#### Theme tweaks")).join(
          " ",
        ),
      ).toContain("must name a package");
      expect(
        messages(
          edited("#### `@mapcairn/theme`", "##### `@mapcairn/theme`"),
        ).join(" "),
      ).toContain("no deeper");
    });

    it("passes each package subheading form", () => {
      for (const form of [
        "`@mapcairn/theme`",
        "@mapcairn/theme",
        "theme",
        "`core`",
        "`@mapcairn/sdk`",
        "sdk",
      ]) {
        expect(messages(edited("`@mapcairn/theme`", form))).toEqual([]);
      }
    });

    it("fails a malformed, impossible or repeated version heading", () => {
      expect(
        messages(edited("## 0.2.0 (2026-12-01)", "## 0.2.0")).join(" "),
      ).toContain("## <version>");
      expect(
        messages(
          edited("## 0.2.0 (2026-12-01)", "## v0.2.0 (2026-12-01)"),
        ).join(" "),
      ).toContain("## <version>");
      expect(
        messages(edited("(2026-12-01)", "(2026-13-45)")).join(" "),
      ).toContain("is not a real date");
      expect(
        messages(
          `${GOOD}\n## 0.2.0 (2026-11-01)\n\n### Thanks\n\nThanks.\n`,
        ).join(" "),
      ).toContain("more than one section");
    });

    it("passes a prerelease version heading", () => {
      expect(
        messages(edited("## 0.2.0 (2026-12-01)", "## 0.2.0-rc.1 (2026-12-01)")),
      ).toEqual([]);
    });

    it("allows one title above the first version only", () => {
      expect(messages(`${GOOD}\n# Another title\n`).join(" ")).toContain(
        "Only one `#` title",
      );
      expect(
        messages(
          `# One\n\n# Two\n\n## 0.1.0 (2026-12-01)\n\n### Thanks\n\nThanks.\n`,
        ).join(" "),
      ).toContain("Only one `#` title");
    });

    it("fails a section heading above any version", () => {
      expect(
        messages("# Changelog\n\n### Thanks\n\nHi.\n").join(" "),
      ).toContain("must be one of");
      expect(messages("# Changelog\n\n#### core\n\nHi.\n").join(" ")).toContain(
        "must name a package",
      );
    });

    it("fails a version with nothing under its heading", () => {
      expect(
        messages(`${PREAMBLE}## 0.1.0 (2026-12-01)\n\n`).join(" "),
      ).toContain("no notes");
    });

    it("reads a heading-like line in a code block as code", () => {
      expect(
        messages(edited(BULLET_LINE, "```md\n### Highlights\n```")),
      ).toEqual([]);
    });
  });

  describe("changes to make on upgrade", () => {
    it("fails an entry with no before and after blocks", () => {
      const bad = edited(
        GOOD.slice(GOOD.indexOf("Before:"), GOOD.indexOf("### Thanks")),
        "",
      );
      expect(messages(bad).join(" ")).toContain(
        "needs a Before and an After code block",
      );
    });

    it("fails an entry with only a before block, or with the blocks in the wrong order", () => {
      const afterStart = GOOD.indexOf("After:");
      const onlyBefore =
        GOOD.slice(0, afterStart) + GOOD.slice(GOOD.indexOf("### Thanks"));
      expect(messages(onlyBefore).join(" ")).toContain(
        "needs a Before and an After code block",
      );
      const swapped = GOOD.replace("Before:", "After:").replace(
        /After:(?![\s\S]*After:)/,
        "Before:",
      );
      expect(messages(swapped).join(" ")).toContain(
        "needs a Before and an After code block",
      );
    });

    it("checks each entry on its own", () => {
      const second = "\n**Another change.** Rename it.\n";
      const found = messages(edited("### Thanks", `${second}\n### Thanks`));
      expect(
        found.filter((message) => message.includes("Before and an After")),
      ).toHaveLength(1);
    });

    it("passes bullet entries and emphasised labels", () => {
      const bulleted = `${PREAMBLE}## 0.1.0 (2026-12-01)\n\n### What to change when you upgrade\n\n- Rename \`a\` to \`b\`.\n\n_Before_\n\n\`\`\`ts\na();\n\`\`\`\n\n_After_\n\n\`\`\`ts\nb();\n\`\`\`\n`;
      expect(messages(bulleted)).toEqual([]);
    });

    it("asks for a bullet or bold lead when the section has text but no entry", () => {
      const loose = `${PREAMBLE}## 0.1.0 (2026-12-01)\n\n### What to change when you upgrade\n\nRename a to b.\n`;
      expect(messages(loose).join(" ")).toContain(
        "Start each change with a bullet or a bold lead",
      );
    });

    it("does not ask for blocks under the other sections", () => {
      expect(
        messages(
          edited(
            "### Thanks",
            "### What got better\n\n- Faster.\n\n### Thanks",
          ),
        ),
      ).toEqual([]);
    });
  });

  describe("forbidden names", () => {
    const word = "zorblaxname";
    const forbidden = [
      {
        hash: createHash("sha256").update(word).digest("hex"),
        length: word.length,
        whole: false,
      },
    ];

    it("fails a listed name without printing it", () => {
      const found = checkChangelog(
        edited("The scale bar", `The scale bar, said ${word}`),
        { forbidden },
      );
      expect(found).toEqual([
        {
          line: GOOD.split("\n").indexOf(BULLET_LINE) + 1,
          message: "A forbidden name (see the names check).",
        },
      ]);
      expect(JSON.stringify(found)).not.toContain(word);
    });

    it("passes the same text with another list", () => {
      expect(
        checkChangelog(edited("The scale bar", `The scale bar, said ${word}`)),
      ).toEqual([]);
    });
  });

  describe("repeated commit subjects", () => {
    const subjectsFor = (version: string) =>
      version === "0.2.0"
        ? [
            "feat(map): add multi-select (#412)",
            "fix: stop a flicker (#413)",
            "chore(release): v0.1.0 (#6)",
          ]
        : null;

    it("fails a bullet that repeats a subject, with or without its prefix and tail", () => {
      for (const bullet of [
        "- feat(map): add multi-select (#412)",
        "- Add multi-select",
        "- **Add multi-select.** ([#412](https://github.com/MapCairn/mapcairn/pull/412))",
        "* ADD MULTI-SELECT",
        "1. Stop a flicker.",
      ]) {
        expect(
          messages(
            edited(
              "- The scale bar no longer flickers while you zoom. ([#470](https://github.com/MapCairn/mapcairn/pull/470))",
              bullet,
            ),
            { subjectsFor },
          ).join(" "),
        ).toContain("repeats a commit subject");
      }
    });

    it("passes a bullet that says more than the subject, and a paragraph that repeats it", () => {
      expect(messages(GOOD, { subjectsFor })).toEqual([]);
      expect(
        messages(
          edited("**Selecting several features.**", "Add multi-select"),
          { subjectsFor },
        ),
      ).toEqual([]);
    });

    it("skips the rule when no subjects are given, or none are known for a version", () => {
      expect(
        messages(
          edited("- The scale bar", "- Add multi-select\n- The scale bar"),
        ),
      ).toEqual([]);
      expect(
        messages(
          edited("- The scale bar", "- Add multi-select\n- The scale bar"),
          { subjectsFor: () => null },
        ),
      ).toEqual([]);
    });

    it("ignores a code block", () => {
      expect(
        messages(edited(BULLET_LINE, "```text\n- Add multi-select\n```"), {
          subjectsFor,
        }),
      ).toEqual([]);
    });
  });
});

describe("git history", () => {
  const folders: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
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
        "-c",
        "tag.gpgsign=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    return result.stdout.trim();
  }

  function scratch(): string {
    const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-check-"));
    folders.push(folder);
    return folder;
  }

  /** A repository with two releases and a changelog that repeats one subject. */
  function repository(): string {
    const root = scratch();
    git(root, "init", "-q", "-b", "main");
    writeFileSync(path.join(root, "a.txt"), "1");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "feat: the first thing (#1)");
    git(root, "tag", "v0.1.0");
    writeFileSync(path.join(root, "a.txt"), "2");
    git(root, "commit", "-q", "-am", "fix(core): stop a crash (#2)");
    git(root, "tag", "v0.1.1");
    writeFileSync(path.join(root, "a.txt"), "3");
    git(root, "commit", "-q", "-am", "feat: add a button (#3)");
    writeFileSync(
      path.join(root, "CHANGELOG.md"),
      `${PREAMBLE}## 0.2.0 (2026-12-01)\n\n### What is new\n\n- Add a button\n\n## 0.1.1 (2026-11-01)\n\n### What got better\n\n- Add a button, which is not in this release\n`,
    );
    return root;
  }

  it("reads the subjects between the tag before a version and its own tag, or the head", () => {
    const subjectsFor = subjectsSincePreviousTag(repository());
    expect(subjectsFor("0.1.1")).toEqual(["fix(core): stop a crash (#2)"]);
    expect(subjectsFor("0.2.0")).toEqual(["feat: add a button (#3)"]);
    expect(subjectsFor("0.1.0")).toEqual(["feat: the first thing (#1)"]);
    expect(subjectsFor("not a version")).toBeNull();
  });

  it("runs the rule in a full clone and reports each finding with its file and line", () => {
    const root = repository();
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(isShallowClone(root)).toBe(false);
    expect(runCheck(path.join(root, "CHANGELOG.md"), root)).toBe(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toMatch(
      /^CHANGELOG\.md:9: This bullet repeats a commit subject/,
    );
    expect(logs).not.toHaveBeenCalled();
  });

  it("skips the rule with a notice in a shallow clone", () => {
    const origin = repository();
    git(origin, "add", "-A");
    git(origin, "commit", "-q", "-m", "docs: changelog");
    const clone = path.join(scratch(), "clone");
    mkdirSync(clone);
    git(
      clone,
      "clone",
      "-q",
      "--depth",
      "1",
      `file://${origin.split(path.sep).join("/")}`,
      ".",
    );
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(isShallowClone(clone)).toBe(true);
    expect(runCheck(path.join(clone, "CHANGELOG.md"), clone)).toBe(0);
    expect(errors).not.toHaveBeenCalled();
    expect(String(logs.mock.calls[0][0])).toContain("is skipped");
  });

  it("says nothing about history when the changelog has no version", () => {
    const root = scratch();
    writeFileSync(path.join(root, "CHANGELOG.md"), PREAMBLE);
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(isShallowClone(root)).toBeNull();
    expect(runCheck(path.join(root, "CHANGELOG.md"), root)).toBe(0);
    expect(logs).not.toHaveBeenCalled();
  });

  it("cannot run on a missing file", () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(runCheck(path.join(scratch(), "CHANGELOG.md"), scratch())).toBe(2);
    expect(String(errors.mock.calls[0][0])).toContain("does not exist");
  });
});

describe("published text", () => {
  /** The first line a finding is reported on, or null for none. */
  function lineOf(text: string): number | null {
    return checkChangelog(text)[0]?.line ?? null;
  }

  /** The good changelog with one line added to the "What got better" bullet. */
  function withLine(line: string): string {
    return edited(BULLET_LINE, `${BULLET_LINE}\n\n${line}`);
  }

  /** The line number the added line lands on. */
  function addedLine(text: string, line: string): number {
    return text.split("\n").indexOf(line) + 1;
  }

  describe("raw HTML", () => {
    it.each([
      '<img src="https://example.test/x.png">',
      "<script>alert(1)</script>",
      "text <b>bold</b> text",
      "</div>",
      "<!-- hidden -->",
      "<?php echo 1 ?>",
      "<https://example.test>",
      "Array<string> is a type",
    ])("fails %s, on its line", (bad) => {
      const text = withLine(bad);
      expect(lineOf(text)).toBe(addedLine(text, bad));
      expect(messages(text).join(" ")).toContain("HTML");
    });

    it("passes a less-than sign that does not open a tag, and HTML in code", () => {
      for (const good of [
        "Fewer than 3 < 4 items, or a <3 sign.",
        "Write `<img>` and ``<b>`x</b>`` in a code span.",
        "```html\n<img src=x>\n<!-- c -->\n```",
        "~~~\n<script>\n~~~",
      ]) {
        expect(messages(withLine(good))).toEqual([]);
      }
    });

    it("does not let an escaped backtick or a line from another span hide a tag", () => {
      for (const bad of [
        "\\`<img src=x>\\`",
        "a ` b\nc ` <img src=x> `",
        "a `` b\n`` <img src=x> `",
        "- a ` <img src=x>\n- b `",
        "`a` `<img src=x>",
        "``<img src=x>`",
      ]) {
        expect(messages(withLine(bad)).join(" ")).toContain("HTML");
      }
    });

    it("does not read a backtick fence with a backtick in its info string as code", () => {
      expect(
        messages(withLine("```a`b\n<img src=x>\n```")).join(" "),
      ).toContain("HTML");
    });

    it("fails a code block that is never closed, on the line that opens it", () => {
      const text = `${GOOD}\n\`\`\`text\n<img src=x>\n`;
      const open = text.split("\n").indexOf("```text") + 1;
      const found = checkChangelog(text).find((finding: { message: string }) =>
        finding.message.includes("never closed"),
      );
      expect(found.line).toBe(open);
    });
  });

  describe("images", () => {
    it.each([
      "![chart](https://github.com/MapCairn/mapcairn/raw/main/a.png)",
      "![chart](docs/a.png)",
      "![chart][a]",
      "see ![](x.png) here",
    ])("fails %s, on its line", (bad) => {
      const text = withLine(bad);
      expect(lineOf(text)).toBe(addedLine(text, bad));
      expect(messages(text).join(" ")).toContain("Images");
    });

    it("passes a bang in plain text, and an image written in a code span", () => {
      expect(messages(withLine("Hello! [x](docs/a.md)"))).toEqual([]);
      expect(messages(withLine("Write `![a](b)` for an image."))).toEqual([]);
    });
  });

  describe("links", () => {
    it.each([
      "[a](https://example.test/page)",
      "[a](http://github.com/MapCairn/mapcairn/pull/1)",
      "[a](https://github.com/other/repo/pull/1)",
      "[a](https://github.com/MapCairn/mapcairn-extra/pull/1)",
      "[a](https://github.com.example.test/MapCairn/mapcairn)",
      "[a](https://github.com@example.test/MapCairn/mapcairn)",
      "[a](//example.test/page)",
      "[a](\\\\example.test)",
      "[a](/\\example.test)",
      "[a](javascript:alert(1))",
      "[a](data:text/html,x)",
      "[a](mailto:someone@example.test)",
      "[a](&#104;ttps://example.test)",
      '[a]( https://example.test/page "title")',
      "[a]: https://example.test/page",
      "  [a]: //example.test/page",
      "[a]: javascript:alert(1)",
      "Visit https://example.test/page today",
      "Visit www.example.test today",
      "Visit http://example.test.",
    ])("fails %s, on its line", (bad) => {
      const text = withLine(bad);
      expect(lineOf(text)).toBe(addedLine(text, bad));
      expect(messages(text).join(" ")).toMatch(/link|address/i);
    });

    it.each([
      "[a](docs/guides/releasing.md)",
      "[a](./docs/guides/releasing.md#heading)",
      "[a](../docs/a.md)",
      "[a](/docs/a.md)",
      "[a](#what-is-new)",
      "[a](https://github.com/MapCairn/mapcairn)",
      "[a](https://github.com/MapCairn/mapcairn/pull/1)",
      "[a](https://github.com/MapCairn/mapcairn/issues/1#issuecomment-2)",
      "[a](https://github.com/MapCairn/mapcairn/blob/main/docs/a.md?plain=1)",
      '[a](https://github.com/mapcairn/mapcairn/pull/1 "title")',
      "[a]: docs/guides/releasing.md",
      "[a]: https://github.com/MapCairn/mapcairn/pull/1",
      "Fixed in #123 and see https://github.com/MapCairn/mapcairn/pull/1.",
      "Write `[a](https://example.test)` and `https://example.test` in code.",
      "```text\nhttps://example.test\n[a](//example.test)\n```",
    ])("passes %s", (good) => {
      expect(messages(withLine(good))).toEqual([]);
    });
  });

  describe("code blocks that hide text", () => {
    it.each([
      "- ```\n  code\n  ```\n  <img src=x onerror=1>\n  ```",
      "- ```\n  code\n  ```\n  [a](//evil.test)\n  ```",
      "* ```\n  x",
      "+ ~~~\n  x",
      "1. ```\n   x",
      "2) ```\n   x",
      "> ```\n> x",
      "> - ```\n>   x",
    ])("fails a fence that starts after a list or quote marker: %j", (bad) => {
      expect(messages(withLine(bad)).join(" ")).toContain("left margin");
    });

    it("fails a fence indented one to three spaces, and reads four as code", () => {
      for (const indent of [" ", "  ", "   "]) {
        expect(
          messages(withLine(`${indent}\`\`\`\nx\n${indent}\`\`\``)).join(" "),
        ).toContain("left margin");
      }
      expect(
        messages(withLine("    ```\n<img src=x>\n    ```")).join(" "),
      ).toContain("HTML");
    });

    it("closes a fence only with a run at least as long", () => {
      expect(messages(withLine("````\n```\n<img src=x>\n````"))).toEqual([]);
      expect(messages(withLine("```\n<img src=x>\n````"))).toEqual([]);
      expect(messages(`${GOOD}\n\`\`\`\`\n<img src=x>\n\`\`\`\n`)).toContain(
        "This code block is never closed, so everything after it would read as code. Close it with a matching fence.",
      );
    });

    it("passes a marker inside a fence at the left margin", () => {
      expect(messages(withLine("```text\n- ```\n> ```\n```"))).toEqual([]);
    });
  });

  describe("line endings and control characters", () => {
    it.each([
      "a `\r\r<img src=x onerror=1> \r\r` b",
      "a\r## 0.3.0 (2026-12-02)",
      "a\r[x]: //evil.test",
      "a\u000b<img src=x>",
      "a\u000c<img src=x>",
      "a\u0000b",
      "a\u0001b",
      "a\u007fb",
    ])("fails %j, on its line", (bad) => {
      const text = withLine(bad);
      const found = checkChangelog(text).find((finding: { message: string }) =>
        finding.message.includes("control character"),
      );
      expect(found.line).toBe(
        text.slice(0, text.indexOf(bad)).split("\n").length,
      );
    });

    it("passes a changelog with Windows line endings and a tab", () => {
      expect(messages(GOOD.replace(/\n/g, "\r\n"))).toEqual([]);
      expect(messages(withLine("a\tb"))).toEqual([]);
    });
  });

  describe("reference definitions anywhere", () => {
    it.each([
      "> [x]: //evil.test",
      "- [x]: //evil.test",
      "  - [x]: javascript:alert(1)",
      "> [x]: javascript:alert(1)",
      "1. [x]: data:text/html,hi",
      "[x]:\t//evil.test",
      "[x]: https://example.test",
      "text [x]: https://example.test",
      "[x]:",
      "[x]:\n//evil.test",
    ])("fails %j", (bad) => {
      expect(messages(withLine(bad)).join(" ")).toMatch(/link/i);
    });

    it("passes a definition that stays in the repository", () => {
      for (const good of [
        "> [x]: docs/a.md",
        "[x]:\tdocs/a.md",
        "- [x]: #what-is-new",
        "1. [x]: https://github.com/MapCairn/mapcairn/pull/1",
      ]) {
        expect(messages(withLine(good))).toEqual([]);
      }
    });
  });

  describe("repository addresses", () => {
    it.each([
      "https://github.com/MapCairn/mapcairn/../../evil/repo",
      "https://github.com/MapCairn/mapcairn/%2e%2e/%2e%2e/evil/repo",
      "https://github.com/MapCairn/mapcairn/%2E%2E%2fevil",
      "https://github.com/MapCairn/mapcairn/..;/evil",
      "https://github.com/MapCairn/mapcairn/./../x",
      "https://github.com/MapCairn/mapcairn%2f..%2fevil",
      "https://github.com/MapCairn/mapcairn@example.test",
      "https://github.com/MapCairn/mapcairn:80",
      "https://github.com:8080/MapCairn/mapcairn",
      "https://user@github.com/MapCairn/mapcairn",
      "https://!@github.com/MapCairn/mapcairn",
      "https://:!@github.com/MapCairn/mapcairn",
      "https://github.com/MapCairn",
      "https://github.com/MapCairn/mapcairn\u0001",
    ])("fails the address %s as a link and as text", (address) => {
      expect(messages(withLine(`[a](${address})`)).join(" ")).toMatch(/link/i);
      expect(messages(withLine(`See ${address}`)).join(" ")).toMatch(/link/i);
    });

    it("passes a page of the repository, whatever the case or query", () => {
      for (const address of [
        "https://github.com/mapcairn/MAPCAIRN",
        "https://github.com/MapCairn/mapcairn?tab=readme#top",
        "https://github.com/MapCairn/mapcairn/compare/a...b",
        "https://github.com/MapCairn/mapcairn/releases/tag/v0.1.0-rc.1",
      ]) {
        expect(messages(withLine(`[a](${address})`))).toEqual([]);
      }
    });
  });

  describe("odd link targets", () => {
    it.each([
      "[a](\u0001//evil.test)",
      "[a](\u007f//evil.test)",
      "[a](a&#58;//evil.test)",
      "[a](a&colon;//evil.test)",
    ])("fails %j", (bad) => {
      expect(messages(withLine(bad)).join(" ")).toMatch(/link/i);
    });

    it("fails an ftp address in text", () => {
      expect(
        messages(withLine("Fetch ftp://example.test/file")).join(" "),
      ).toMatch(/link/i);
    });
  });

  describe("email addresses", () => {
    it.each([
      "mail someone@example.test",
      "mail Some.One+tag@sub.example.test.",
      "(someone@example.test)",
    ])("fails %j, because a renderer makes it a mailto link", (bad) => {
      expect(messages(withLine(bad)).join(" ")).toContain("email");
    });

    it("passes an address in a code span and a scoped package name", () => {
      expect(messages(withLine("mail `someone@example.test`"))).toEqual([]);
      expect(messages(withLine("see (@mapcairn/theme/tokens.css)"))).toEqual(
        [],
      );
    });
  });

  describe("a long line", () => {
    it("finishes quickly on a line of spaces", () => {
      const started = Date.now();
      for (const shape of [
        `${" ".repeat(100_000)}x`,
        `- ${" ".repeat(100_000)}x`,
        `${" ".repeat(100_000)}`,
        `x${" ".repeat(100_000)}y`,
      ]) {
        checkChangelog(withLine(shape));
      }
      expect(Date.now() - started).toBeLessThan(2000);
    });
  });

  describe("links inside an unbalanced link", () => {
    it.each([
      "[a]([b](//evil.test)",
      "[a]( [b](//evil.test)",
      "[a]([b]([c](//evil.test)",
      "[a]([b](javascript&#58;alert(1))",
      "[a]([b](\\\\evil.test)",
      "[a](\n[b](//evil.test)",
      "[a]([x]: //evil.test",
      "[x]: [y]: //evil.test",
      "[a [x]: //evil.test",
    ])("fails %j", (bad) => {
      expect(messages(withLine(bad)).join(" ")).toMatch(/link/i);
    });
  });

  describe("trailing punctuation and dot segments", () => {
    it("lets a repository address end in sentence punctuation, tildes included", () => {
      for (const good of [
        "https://github.com/MapCairn/mapcairn~~",
        "(see https://github.com/MapCairn/mapcairn)",
        "(https://github.com/MapCairn/mapcairn/pull/1).",
        "*https://github.com/MapCairn/mapcairn/pull/1*",
      ]) {
        expect(messages(withLine(good))).toEqual([]);
      }
      expect(messages(withLine("~www.evil.test~")).join(" ")).toMatch(/link/i);
    });

    it.each([
      "https://github.com/MapCairn/mapcairn/..%3b/x",
      "https://github.com/MapCairn/mapcairn/.%3Bx/../../x",
      "https://github.com/MapCairn/mapcairn/‮/x",
    ])("fails the address %j", (address) => {
      expect(messages(withLine(`[a](${address})`)).join(" ")).toMatch(/link/i);
    });

    it("fails a format character, such as a right-to-left override, in a target", () => {
      expect(messages(withLine("[a](docs/‮a.md)")).join(" ")).toMatch(/link/i);
    });
  });

  /** Generous, because a slow runner takes several times as long as a laptop. */
  describe("time on long lines", { timeout: 60_000 }, () => {
    const UNITS = [
      " ",
      "`",
      "[",
      "](",
      "<",
      "\\",
      "\t",
      "http://",
      "www.",
      "[x]: ",
      "]:",
      "@",
      "a@",
      "a@a.",
      "!",
      "](<",
      "- ",
      "> ",
      "#",
      "\r\n",
      "`a `",
      "[a](",
      "&",
      "%2e",
      "/",
      ".",
      "(",
      ")",
      "*",
      "_",
      "\\<",
      "a.b.",
      "x@y-",
      " ",
      "<a ",
      "<!--",
      "~",
      "=",
      "-",
      "a",
    ];
    const HEAD = "## 0.1.0 (2026-12-01)\n\n### What is new\n\n";
    /** The smaller size, and the larger one, four times as big. */
    const SMALL = 25_000;
    const LARGE = 4 * SMALL;
    /** Linear work grows about 4 times from SMALL to LARGE, quadratic about 16. */
    const MAX_GROWTH = 10;
    /** Below this a timing is noise, so it is not divided into. */
    const NOISE_MS = 20;

    function bestOfThree(text: string): number {
      let best = Number.POSITIVE_INFINITY;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        checkChangelog(text);
        best = Math.min(best, performance.now() - started);
      }
      return best;
    }

    /**
     * Fails when the time grows much faster than the size. It compares two
     * sizes of the same shape instead of a fixed time, so a slow machine does
     * not fail it.
     */
    function expectLinear(make: (size: number) => string): void {
      const small = bestOfThree(make(SMALL));
      const large = bestOfThree(make(LARGE));
      expect(large / Math.max(small, NOISE_MS)).toBeLessThan(MAX_GROWTH);
    }

    it.each(UNITS)("scales linearly on a line of %j", (unit) => {
      const repeated = (size: number) =>
        unit.repeat(Math.ceil(size / unit.length));
      expectLinear((size) => `${HEAD}${repeated(size)}\n`);
      expectLinear((size) => `${HEAD}a ${repeated(size)}!\n`);
      expectLinear(
        (size) =>
          `${HEAD}${`${unit}\n`.repeat(Math.ceil(size / (unit.length + 1)))}`,
      );
    });

    it("scales linearly on many ATX version headings", () => {
      expectLinear(
        (size) => `${HEAD}${"## 0.1.0 (2026-12-01)\n".repeat(size)}`,
      );
    });

    it("scales linearly on many underlined headings", () => {
      expectLinear((size) => `${HEAD}${"x\n-\n".repeat(size / 2)}`);
    });

    it.each([
      ["a", "a", ""],
      ["www.", ".", "a"],
      ["http://", "*", "a"],
      ["www.", "~", "a"],
      ["", "a.", "!"],
    ])("scales linearly on %j then a run of %j then %j", (start, unit, end) => {
      expectLinear((size) => `${HEAD}${start}${unit.repeat(size)}${end}\n`);
    });
  });

  describe("headings", () => {
    const VERSION = "## 0.2.0 (2026-12-01)";

    it.each([
      [`   ${VERSION}`, 1],
      [`${VERSION.replace("##", " ##")}`, 1],
    ])("fails a version heading indented to %j", (heading) => {
      const text = GOOD.replace(VERSION, heading);
      expect(messages(text).join(" ")).toContain("left margin");
    });

    it("fails an indented section heading and package heading", () => {
      const section = GOOD.replace("### What is new", "  ### What is new");
      const pkg = GOOD.replace(
        "#### `@mapcairn/theme`",
        "   #### `@mapcairn/theme`",
      );
      expect(messages(section).join(" ")).toContain("left margin");
      expect(messages(pkg).join(" ")).toContain("left margin");
    });

    it("reads an indented heading as a heading, so a wrong one is named and a correct one is not a bullet", () => {
      const text = GOOD.replace("### Thanks", "   ### Unknown heading");
      expect(messages(text).join(" ")).toContain("must be one of");
    });

    it("fails an indented title and does not count it as a version", () => {
      const text = GOOD.replace("# Changelog", "  # Changelog");
      expect(messages(text).join(" ")).toContain("left margin");
    });

    it("does not read four spaces of indent as a heading, nor a heading in a code block", () => {
      expect(messages(withLine("    ## not a heading"))).toEqual([]);
      expect(
        messages(withLine("```md\n  ## in code\nTitle\n===\n```")),
      ).toEqual([]);
    });

    it("fails a setext heading of either level, on the text line", () => {
      for (const underline of ["===", "---", "  ===", "-", "======="]) {
        const text = withLine(`Sneaky\n${underline}`);
        const found = checkChangelog(text).find(
          (finding: { message: string }) =>
            finding.message.includes("underlined"),
        );
        expect(found.line).toBe(addedLine(text, "Sneaky"));
      }
    });

    it("fails a setext version heading and keeps its notes out of the previous version", () => {
      const text = `${PREAMBLE}## 0.1.0 (2026-11-01)\n\n### What is new\n\nOld.\n\n0.2.0 (2026-12-01)\n------------------\n\n### What is new\n\nNew.\n`;
      expect(messages(text).join(" ")).toContain("underlined");
      expect(
        parseChangelog(text).sections.map(
          (section: { version: string | null }) => section.version,
        ),
      ).toEqual(["0.1.0", null]);
    });

    it("reads an indented upgrade heading, so its entries still need a before and an after", () => {
      const text = GOOD.replace(
        "### What to change when you upgrade",
        "  ### What to change when you upgrade",
      ).replace("Before:", "Earlier:");
      expect(messages(text).join(" ")).toContain("Before and an After");
    });

    it("does not read a line under an underline as a second heading", () => {
      const text = withLine("Sneaky\n===\n---");
      const underlined = checkChangelog(text).filter(
        (finding: { message: string }) =>
          finding.message.includes("underlined"),
      );
      expect(underlined).toHaveLength(1);
    });

    it("passes a thematic break and a list item followed by dashes", () => {
      for (const good of [
        "---",
        "***",
        "- one\n---",
        "> quote\n---",
        "a\n\n---",
      ]) {
        expect(messages(withLine(good))).toEqual([]);
      }
    });
  });
});
