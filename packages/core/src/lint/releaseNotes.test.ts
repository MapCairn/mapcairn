// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractNotes,
  insertSection,
  parseChangelog,
  scanLines,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/release/changelog.mjs";

const NOTES_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/release/notes.mjs",
);

const PREAMBLE = "# Changelog\n\nWhat changed.\n";

const CHANGELOG = `${PREAMBLE}
## 0.2.0 (2026-12-01)

### What is new

Selecting several features, in one go.

\`\`\`ts
## not a heading, inside a code block
\`\`\`

### Thanks

Thank you to \`octo\`.

## 0.1.0 (2026-11-01)

### What is new

The first release.
`;

describe("scanLines", () => {
  it("marks fences and what is inside them, with a longer closing fence", () => {
    const lines = scanLines("a\n```ts\nb\n````\nc\n~~~\nd\n~~~\ne");
    expect(lines.map((line: { fenced: boolean }) => line.fenced)).toEqual([
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(lines[4].number).toBe(5);
  });

  it("does not close a fence on a different character or a shorter run", () => {
    const lines = scanLines("```\nx\n~~~\n``\ny");
    expect(lines.every((line: { fenced: boolean }) => line.fenced)).toBe(true);
  });
});

describe("parseChangelog", () => {
  it("splits the preamble from the versions and ignores a heading in a code block", () => {
    const { preamble, sections } = parseChangelog(CHANGELOG);
    expect(preamble[0].text).toBe("# Changelog");
    expect(
      sections.map((section: { version: string }) => section.version),
    ).toEqual(["0.2.0", "0.1.0"]);
    expect(sections[0]).toMatchObject({ date: "2026-12-01", headingLine: 5 });
  });

  it("keeps a section whose heading is not a version heading, with no version", () => {
    const { sections } = parseChangelog("# T\n\n## Unreleased\n\nText\n");
    expect(sections).toEqual([
      expect.objectContaining({ version: null, date: null }),
    ]);
  });
});

describe("extractNotes", () => {
  it("returns one version's notes without the heading, whole and trimmed", () => {
    const notes = extractNotes(CHANGELOG, "0.2.0");
    expect(notes.startsWith("### What is new")).toBe(true);
    expect(notes).toContain("## not a heading, inside a code block");
    expect(notes.endsWith("Thank you to `octo`.")).toBe(true);
    expect(notes).not.toContain("The first release.");
  });

  it("takes a leading v and the last section", () => {
    expect(extractNotes(CHANGELOG, "v0.1.0")).toBe(
      "### What is new\n\nThe first release.",
    );
  });

  it("returns null for a version it does not have", () => {
    expect(extractNotes(CHANGELOG, "0.3.0")).toBeNull();
    expect(extractNotes(CHANGELOG, "0.2")).toBeNull();
  });
});

describe("insertSection", () => {
  it("puts the new version above the newest and below the preamble", () => {
    const next = insertSection(
      CHANGELOG,
      "0.3.0",
      "2027-01-02",
      "### What is new\n\nMore.\n\n",
    );
    expect(next).toContain(
      `${PREAMBLE}\n## 0.3.0 (2027-01-02)\n\n### What is new\n\nMore.\n\n## 0.2.0 (2026-12-01)`,
    );
    expect(extractNotes(next, "0.3.0")).toBe("### What is new\n\nMore.");
    expect(extractNotes(next, "0.2.0")).toBe(extractNotes(CHANGELOG, "0.2.0"));
  });

  it("adds the first version after the preamble of an empty changelog", () => {
    const next = insertSection(
      PREAMBLE,
      "0.1.0",
      "2026-12-01",
      "### What is new\n\nFirst.",
    );
    expect(next).toBe(
      `${PREAMBLE}\n## 0.1.0 (2026-12-01)\n\n### What is new\n\nFirst.\n`,
    );
  });
});

describe("notes script", () => {
  const folders: string[] = [];

  afterEach(() => {
    for (const folder of folders.splice(0)) {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  function runNotes(...args: string[]) {
    const folder = mkdtempSync(path.join(tmpdir(), "mapcairn-notes-"));
    folders.push(folder);
    writeFileSync(path.join(folder, "CHANGELOG.md"), CHANGELOG);
    return spawnSync(
      process.execPath,
      [
        NOTES_SCRIPT,
        ...args.map((arg) =>
          arg.replace("<file>", path.join(folder, "CHANGELOG.md")),
        ),
      ],
      { encoding: "utf8" },
    );
  }

  it("prints the notes of a version for the release body", () => {
    const result = runNotes("0.1.0", "<file>");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("### What is new\n\nThe first release.\n");
  });

  it("exits 1 for a version the changelog lacks", () => {
    const result = runNotes("9.9.9", "<file>");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no section for 9.9.9");
  });

  it("exits 2 with no version or a missing file", () => {
    expect(runNotes().status).toBe(2);
    expect(
      spawnSync(
        process.execPath,
        [NOTES_SCRIPT, "0.1.0", path.join(tmpdir(), "mapcairn-missing.md")],
        { encoding: "utf8" },
      ).status,
    ).toBe(2);
  });
});
