// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { buildChangelog, parseChangelog, releasePage } from "./changelogPages";

const CHANGELOG = [
  "# Changelog",
  "",
  "What changed in each release.",
  "",
  "## 0.2.0 (2026-12-01)",
  "",
  "### What is new",
  "",
  "This release adds a thing. It also fixes `one` bug.",
  "",
  "### Upgrade notes",
  "",
  "Nothing to change.",
  "",
  "## 0.1.0-rc.1 (2026-11-20)",
  "",
  "### What is new",
  "",
  "The first release candidate, see [the pull request](https://example.org/pull/1).",
  "",
].join("\n");

describe("parseChangelog", () => {
  it("reads each release with its version, date and body, newest first", () => {
    const releases = parseChangelog(CHANGELOG);
    expect(releases.map(({ version, date }) => ({ version, date }))).toEqual([
      { version: "0.2.0", date: "2026-12-01" },
      { version: "0.1.0-rc.1", date: "2026-11-20" },
    ]);
    expect(releases[0]?.body).toContain("### Upgrade notes");
    expect(releases[0]?.body).not.toContain("0.1.0-rc.1");
  });

  it("ignores text before the first release", () => {
    expect(parseChangelog("# Changelog\n\nOnly an introduction.\n")).toEqual(
      [],
    );
  });

  it("does not read a heading inside a code block as a release", () => {
    const text = "## 1.0.0 (2027-01-01)\n\n```md\n## 0.0.1 (2020-01-01)\n```\n";
    expect(parseChangelog(text).map(({ version }) => version)).toEqual([
      "1.0.0",
    ]);
  });
});

describe("releasePage", () => {
  const [release] = parseChangelog(CHANGELOG);
  const page = release ? releasePage(release) : "";

  it("has the front matter the build requires", () => {
    expect(page).toMatch(/^---\n\ntitle: "Release 0\.2\.0"\n/);
    expect(page).toContain('sidebar_label: "0.2.0"');
    expect(page).toContain('description: "This release adds a thing."');
  });

  it("opens with the date and moves each heading up a level", () => {
    expect(page).toContain("# Release 0.2.0\n\nReleased on 1 December 2026.");
    expect(page).toContain("\n## What is new\n");
    expect(page).toContain("\n## Upgrade notes\n");
    expect(page).not.toContain("###");
  });

  it("keeps the body's text", () => {
    expect(page).toContain("It also fixes `one` bug.");
  });
});

describe("releasePage code blocks", () => {
  const text = [
    "## 1.0.0 (2027-01-01)",
    "",
    "### What is new",
    "",
    "```ts",
    "const a = 1;",
    "```",
    "",
    "```tsx check",
    "const b = 2;",
    "```",
    "",
    "```bash",
    "npm install",
    "```",
    "",
  ].join("\n");
  const [release] = parseChangelog(text);
  const page = release ? releasePage(release) : "";

  it("marks a ts block no-check, because it was written for that release", () => {
    expect(page).toContain("```ts no-check\nconst a = 1;");
  });

  it("leaves a block that already has a marker, and other languages, as written", () => {
    expect(page).toContain("```tsx check\nconst b = 2;");
    expect(page).toContain("```bash\nnpm install");
  });
});

describe("buildChangelog", () => {
  const built = buildChangelog(CHANGELOG);

  it("writes an index and a page for each release", () => {
    expect([...built.files.keys()].sort()).toEqual([
      "0.1.0-rc.1.md",
      "0.2.0.md",
      "index.md",
    ]);
  });

  it("lists the releases on the index, newest first, with links to the pages", () => {
    const index = built.files.get("index.md") ?? "";
    expect(index.indexOf("[0.2.0](0.2.0.md)")).toBeGreaterThan(-1);
    expect(index.indexOf("[0.2.0](0.2.0.md)")).toBeLessThan(
      index.indexOf("[0.1.0-rc.1](0.1.0-rc.1.md)"),
    );
  });

  it("puts every page in the sidebar", () => {
    expect(built.sidebar).toEqual({
      type: "category",
      label: "Changelog",
      link: { type: "doc", id: "changelog/index" },
      items: ["changelog/0.2.0", "changelog/0.1.0-rc.1"],
    });
  });

  it("stops when the changelog holds no release", () => {
    expect(() => buildChangelog("# Changelog\n")).toThrow(
      "CHANGELOG.md has no release",
    );
  });
});
