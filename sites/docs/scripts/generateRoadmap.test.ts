// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateRoadmap } from "./generateRoadmap";
import { parseDocSource } from "./markdownCopies";

const REAL_ROADMAP = readFileSync(
  new URL("../../../ROADMAP.md", import.meta.url),
  "utf8",
);

const MILESTONE = "https://github.com/MapCairn/mapcairn/milestone";

/** A small roadmap in the shape of the real one. */
const ROADMAP_TEXT = [
  "# Roadmap",
  "## Priorities",
  "### Now",
  `1. **Site, [Selection](${MILESTONE}/5) ([#49](https://github.com/MapCairn/mapcairn/issues/49)).** Select things.`,
  "### Next",
  `1. **SDK, [Release](${MILESTONE}/8).** Ship it.`,
  "### Later",
  `- **Site, [Terrain](${MILESTONE}/13).** Tilt.`,
  "## Intentions",
].join("\n");

const NOW = new Date("2026-11-22T10:30:00Z");

/** A network that is blocked: every request fails. */
const offline = async (): Promise<Response> => {
  throw new TypeError("fetch failed");
};

const SAVED = JSON.stringify({
  fetchedAt: "2026-11-01T00:00:00.000Z",
  milestones: { "5": { open: 1, closed: 1 } },
});

describe("generateRoadmap", () => {
  it("builds the page of the real ROADMAP.md with no network, from the saved counts", async () => {
    const generated = await generateRoadmap({
      roadmapText: ROADMAP_TEXT,
      savedText: SAVED,
      fetchFn: offline,
      now: NOW,
    });
    expect(generated.source).toBe("saved");
    expect(generated.page).toContain("## Now");
    expect(generated.page).toContain("### Selection");
    expect(generated.page).toContain("1 of 2 issues closed (50%), 1 open");
    expect(parseDocSource("roadmap", generated.page).title).toBe("Roadmap");
  });

  it("builds the page of the real ROADMAP.md, so a malformed list fails the docs build", async () => {
    const generated = await generateRoadmap({
      roadmapText: REAL_ROADMAP,
      savedText: null,
      fetchFn: offline,
      now: NOW,
    });
    expect(generated.page).toMatch(/## Now[\s\S]*## Next[\s\S]*## Later/);
  });

  it("still builds the page with no network and nothing saved, or a saved file that is unusable", async () => {
    for (const savedText of [null, "not json", '{"fetchedAt":1}']) {
      const generated = await generateRoadmap({
        roadmapText: ROADMAP_TEXT,
        savedText,
        fetchFn: offline,
        now: NOW,
      });
      expect(generated.source).toBe("none");
      expect(generated.page).toContain(
        "Issue counts could not be read when this site was built.",
      );
    }
  });

  it("uses fresh counts when GitHub answers", async () => {
    const generated = await generateRoadmap({
      roadmapText: ROADMAP_TEXT,
      savedText: SAVED,
      fetchFn: async () =>
        new Response(
          JSON.stringify([{ number: 5, open_issues: 0, closed_issues: 9 }]),
        ),
      now: NOW,
    });
    expect(generated.source).toBe("github");
    expect(generated.page).toContain("9 of 9 issues closed (100%), 0 open");
  });

  it("fails on a roadmap the check would fail on, not on GitHub", async () => {
    await expect(
      generateRoadmap({
        roadmapText: "# Roadmap",
        savedText: null,
        fetchFn: offline,
        now: NOW,
      }),
    ).rejects.toThrow(/not well formed/);
  });
});
