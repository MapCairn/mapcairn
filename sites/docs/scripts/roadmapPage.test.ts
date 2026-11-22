// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { copyText, parseDocSource } from "./markdownCopies";
import { buildRoadmapPage, PRIORITY_NOT_SCHEDULE } from "./roadmapPage";
import type { Roadmap } from "./roadmapSource";

const MILESTONE = "https://github.com/MapCairn/mapcairn/milestone";

const ROADMAP: Roadmap = {
  reviewed: "2026-11-22",
  lanes: [
    {
      name: "Now",
      items: [
        {
          track: "Site",
          title: "Selection",
          milestone: 5,
          milestoneUrl: `${MILESTONE}/5`,
          trackers: [49],
          text: "Visitors can select several features. The rest is detail with [a plan](docs/plans/0017-x.md).",
        },
      ],
    },
    {
      name: "Next",
      items: [
        {
          track: "SDK",
          title: "First release",
          milestone: 8,
          milestoneUrl: `${MILESTONE}/8`,
          trackers: [1, 4],
          text: "See [the plan](docs/plans/0017-x.md) for what is left. More.",
        },
        {
          track: "Site",
          title: "Layer controls",
          milestone: 9,
          milestoneUrl: `${MILESTONE}/9`,
          trackers: [],
          text: "Order and filter layers.",
        },
      ],
    },
    {
      name: "Later",
      items: [
        {
          track: "SDK",
          title: "Large data",
          milestone: 10,
          milestoneUrl: `${MILESTONE}/10`,
          trackers: [],
          text: "Fast on big layers.",
        },
      ],
    },
  ],
};

const SNAPSHOT = {
  fetchedAt: "2026-11-22T10:30:00.000Z",
  milestones: {
    "5": { open: 8, closed: 4 },
    "8": { open: 0, closed: 3 },
    "9": { open: 0, closed: 0 },
  },
};

const page = (
  snapshot: typeof SNAPSHOT | null = SNAPSHOT,
  source: "github" | "saved" | "none" = "github",
) => buildRoadmapPage(ROADMAP, { snapshot, source });

/** The text of one card, from its heading to its closing tag. */
function card(text: string, title: string): string {
  const start = text.indexOf(`### ${title}`);
  return text.slice(start, text.indexOf("</article>", start));
}

describe("buildRoadmapPage", () => {
  it("is a docs page with front matter that the copies and llms.txt can read", () => {
    const parsed = parseDocSource("roadmap", page());
    expect(parsed.title).toBe("Roadmap");
    expect(parsed.description).toContain("priority, not a schedule");
    expect(parsed.permalink).toBe("/roadmap/");
  });

  it("says the order is a priority, not a schedule, and links its source", () => {
    expect(page()).toContain(PRIORITY_NOT_SCHEDULE);
    expect(page()).toContain(
      "https://github.com/MapCairn/mapcairn/blob/main/ROADMAP.md",
    );
  });

  it("has the three lanes in order, each milestone a card under its lane", () => {
    const text = page();
    const order = ["## Now", "## Next", "## Later"].map((h) => text.indexOf(h));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text.match(/<article className="roadmap__card">/g)).toHaveLength(4);
    expect(text.indexOf("### Selection")).toBeLessThan(order[1] ?? 0);
    expect(text.indexOf("### Large data")).toBeGreaterThan(order[2] ?? 0);
  });

  it("shows closed of total as text and a percentage, and a progress bar beside it", () => {
    const text = page();
    expect(text).toContain("4 of 12 issues closed (33%), 8 open");
    expect(text).toContain(
      '<progress className="roadmap__bar" value={4} max={12} aria-hidden="true"></progress>',
    );
    expect(text).toContain("3 of 3 issues closed (100%), 0 open");
  });

  it("says so for a milestone with no issues, with no bar, and for one the counts miss", () => {
    const text = page();
    expect(card(text, "Layer controls")).toContain("No issues yet.");
    expect(card(text, "Layer controls")).not.toContain("<progress");
    expect(card(text, "Large data")).toContain(
      "Issue counts are not available for this milestone.",
    );
  });

  it("links each milestone and its trackers, and shows the first sentence only", () => {
    const text = page();
    expect(text).toContain(`[View on GitHub](${MILESTONE}/5)`);
    expect(text).toContain(
      "[#1](https://github.com/MapCairn/mapcairn/issues/1)",
    );
    expect(text).toContain(
      "[#4](https://github.com/MapCairn/mapcairn/issues/4)",
    );
    expect(text).toContain("Visitors can select several features.");
    expect(text).not.toContain("The rest is detail");
  });

  it("turns a repository-relative link into an absolute one", () => {
    expect(page()).toContain(
      "[the plan](https://github.com/MapCairn/mapcairn/blob/main/docs/plans/0017-x.md)",
    );
  });

  it("states when the counts were fetched, and when they are older saved ones", () => {
    expect(page()).toContain(
      "Issue counts were fetched from GitHub on 22 November 2026.",
    );
    expect(page(SNAPSHOT, "saved")).toContain(
      "GitHub could not be reached when this site was built, so the issue counts are the last good read, from 22 November 2026.",
    );
    const none = page(null, "none");
    expect(none).toContain(
      "Issue counts could not be read when this site was built.",
    );
    expect(none).not.toContain("<progress");
  });

  it("names when ROADMAP.md was last reviewed", () => {
    expect(page()).toContain("last reviewed on 22 November 2026");
  });

  it("makes a Markdown copy that carries the lanes, milestones and counts as text", () => {
    const parsed = parseDocSource("roadmap", page());
    const copy = copyText(parsed, [parsed], {
      origin: "https://example.test",
      baseUrl: "/docs/",
      version: "1.0.0",
      title: "t",
      tagline: "t",
    });
    expect(copy).toMatch(/## Now[\s\S]*## Next[\s\S]*## Later/);
    expect(copy).toContain("### Selection");
    expect(copy).toContain("4 of 12 issues closed (33%), 8 open");
    expect(copy).toContain("No issues yet.");
    expect(copy).toContain(PRIORITY_NOT_SCHEDULE);
    expect(copy).not.toMatch(/<\/?(?:article|section|div|progress)/);
    expect(copy).not.toMatch(/\n{3,}/);
  });
});
