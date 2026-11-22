// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { roadmapFindings } from "./roadmapChecks";
import { PRIORITY_NOT_SCHEDULE } from "./roadmapPage";

const roots: string[] = [];

const LANES = ["Now", "Next", "Later"];
const HTML = `<p>${PRIORITY_NOT_SCHEDULE}</p>${LANES.map(
  (name) => `<section class="roadmap__lane"><h2>${name}</h2></section>`,
).join("")}`;
const COPY = `# Roadmap\n\n${PRIORITY_NOT_SCHEDULE}\n\n${LANES.map((name) => `## ${name}`).join("\n\n")}\n`;

function site(html: string | null, copy: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "mapcairn-roadmap-"));
  roots.push(root);
  if (html !== null) {
    mkdirSync(join(root, "roadmap"));
    writeFileSync(join(root, "roadmap", "index.html"), html);
  }
  if (copy !== null) {
    writeFileSync(join(root, "roadmap.md"), copy);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("roadmapFindings", () => {
  it("passes a build with the page, its three lanes and a copy that has the same text", () => {
    expect(roadmapFindings(site(HTML, COPY))).toEqual([]);
  });

  it("reports a page that was not built", () => {
    expect(roadmapFindings(site(null, COPY)).join("\n")).toContain(
      "roadmap page was not built",
    );
  });

  it("reports a page with a lane missing or without the priority sentence", () => {
    const fewer = HTML.replace(
      '<section class="roadmap__lane"><h2>Later</h2></section>',
      "",
    );
    expect(roadmapFindings(site(fewer, COPY)).join("\n")).toContain(
      "has 2 lanes",
    );
    const bare = HTML.replace(PRIORITY_NOT_SCHEDULE, "");
    expect(roadmapFindings(site(bare, COPY)).join("\n")).toContain(
      PRIORITY_NOT_SCHEDULE,
    );
  });

  it("reports a Markdown copy that is missing or leaves out a lane", () => {
    expect(roadmapFindings(site(HTML, null)).join("\n")).toContain(
      "roadmap.md",
    );
    const thin = COPY.replace("## Later", "");
    expect(roadmapFindings(site(HTML, thin)).join("\n")).toContain("## Later");
  });
});
