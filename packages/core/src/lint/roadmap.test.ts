// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  checkRoadmap,
  parseIssueStates,
  parseMilestoneStates,
  readIssueStates,
  readMilestoneStates,
  runRoadmapCheck,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/roadmap-check.mjs";

/** A roadmap with a Priorities section, built from the three lists. */
function roadmap(now: string[], next: string[], later: string[]): string {
  const list = (items: string[]) =>
    items.map((text, index) => `${index + 1}. ${text}`).join("\n");
  return [
    "# Roadmap",
    "## Direction",
    "Mentions #999 outside the list.",
    "## Priorities",
    "Intro mentions #777 and #1, which are not in a list.",
    "### Now",
    list(now),
    "### Next",
    list(next),
    "### Later",
    list(later),
    "## Intentions",
    "Mentions #998 outside the list.",
  ].join("\n");
}

const open = (...numbers: number[]) =>
  new Map<number, string>(numbers.map((n) => [n, "OPEN"]));

const MILESTONE_URL = "https://github.com/MapCairn/mapcairn/milestone";

/** A roadmap item that links a GitHub milestone, as `ROADMAP.md` does. */
const item = (milestone: number) =>
  `**SDK, [Milestone ${milestone}](${MILESTONE_URL}/${milestone}).** An outcome.`;

describe("checkRoadmap", () => {
  it("accepts a list whose issues all exist and are open", () => {
    const text = roadmap(["**SDK, #1.** One."], ["**Site, #2.** Two."], ["#3"]);
    expect(checkRoadmap(text, open(1, 2, 3))).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("reads only the three lists, not the introduction or other sections", () => {
    const text = roadmap(["#1"], ["#2"], ["#3"]);
    expect(checkRoadmap(text, open(1, 2, 3)).errors).toEqual([]);
    expect(checkRoadmap(text, open(1, 2, 3)).warnings).toEqual([]);
    const closedIntro = new Map([
      [1, "OPEN"],
      [2, "OPEN"],
      [3, "OPEN"],
      [777, "CLOSED"],
    ]);
    expect(checkRoadmap(text, closedIntro).warnings).toEqual([]);
  });

  it("ignores a number written as an HTML entity or inside a code span", () => {
    const text = roadmap(
      ["Don&#39;t, `#500` and #1."],
      ["``#501`` and #2"],
      ["#3"],
    );
    expect(checkRoadmap(text, open(1, 2, 3))).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("finds a heading with trailing spaces", () => {
    const text = roadmap(["#1"], ["#2"], ["#3"])
      .replace("### Now", "### Now  ")
      .replace("## Priorities", "## Priorities ");
    expect(checkRoadmap(text, open(1, 2, 3)).errors).toEqual([]);
  });

  it("reads a file with Windows line endings", () => {
    const text = roadmap(["#1", "#2"], ["#3"], ["#4"]).replaceAll("\n", "\r\n");
    expect(checkRoadmap(text, open(1, 2, 3, 4))).toEqual({
      errors: [],
      warnings: [],
    });
    const four = roadmap(["#1", "#2", "#3", "#4"], ["#5"], ["#6"]).replaceAll(
      "\n",
      "\r\n",
    );
    expect(checkRoadmap(four, null).errors).toEqual([
      "Now has 4 items, at most 3 are allowed",
    ]);
  });

  it("treats a number above the highest returned as unknown, not as missing", () => {
    const text = roadmap(["#1"], ["#2"], ["#50"]);
    expect(checkRoadmap(text, open(1, 2, 3))).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("reports an issue number that does not exist", () => {
    const text = roadmap(["#1"], ["#2"], ["#3"]);
    const { errors } = checkRoadmap(text, open(1, 3));
    expect(errors).toEqual(["#2 does not exist"]);
  });

  it("reports a repeated issue number once, whichever lists it appears in", () => {
    const text = roadmap(["#1, #1"], ["#1"], ["#2"]);
    const { errors } = checkRoadmap(text, open(1, 2));
    expect(errors).toEqual(["#1 is listed more than once"]);
  });

  it("reports more than three numbered items under Now", () => {
    const text = roadmap(["#1", "#2", "#3", "#4"], ["#5"], ["#6"]);
    const { errors } = checkRoadmap(text, open(1, 2, 3, 4, 5, 6));
    expect(errors).toEqual(["Now has 4 items, at most 3 are allowed"]);
  });

  it("accepts exactly three items under Now", () => {
    const text = roadmap(["#1", "#2", "#3"], ["#4"], ["#5"]);
    expect(checkRoadmap(text, open(1, 2, 3, 4, 5)).errors).toEqual([]);
  });

  it("reports more than six numbered items under Next", () => {
    const text = roadmap(
      ["#1"],
      ["#2", "#3", "#4", "#5", "#6", "#7", "#8"],
      ["#9"],
    );
    const { errors } = checkRoadmap(text, open(1, 2, 3, 4, 5, 6, 7, 8, 9));
    expect(errors).toEqual(["Next has 7 items, at most 6 are allowed"]);
  });

  it("accepts exactly six items under Next, and any number under Later", () => {
    const text = roadmap(
      ["#1"],
      ["#2", "#3", "#4", "#5", "#6", "#7"],
      ["#8", "#9", "#10", "#11", "#12", "#13", "#14"],
    );
    const numbers = Array.from({ length: 14 }, (_, index) => index + 1);
    expect(checkRoadmap(text, open(...numbers)).errors).toEqual([]);
  });

  it("counts items, not issue numbers, so one item may name several issues", () => {
    const text = roadmap(["#1, #2, #3, #4, #5, #6"], ["#7"], ["#8"]);
    expect(checkRoadmap(text, open(1, 2, 3, 4, 5, 6, 7, 8)).errors).toEqual([]);
  });

  it("reports each missing section", () => {
    const text = "## Priorities\n### Now\n1. #1\n## Intentions\n";
    const { errors } = checkRoadmap(text, open(1));
    expect(errors).toEqual([
      'the "### Next" section is missing',
      'the "### Later" section is missing',
    ]);
  });

  it("reports a missing Priorities section and stops there", () => {
    const { errors } = checkRoadmap("# Roadmap\n## Direction\n", open(1));
    expect(errors).toEqual(['the "## Priorities" section is missing']);
  });

  it("does not take a Now heading in another section for the list's", () => {
    const text = `${roadmap(["#1"], ["#2"], ["#3"])}\n### Now\n1. #1\n2. #1\n3. #1\n4. #1\n5. #1\n6. #1\n`;
    expect(checkRoadmap(text, open(1, 2, 3)).errors).toEqual([]);
  });

  it("warns, and does not fail, for a closed issue", () => {
    const text = roadmap(["#1"], ["#2"], ["#3"]);
    const states = new Map([
      [1, "OPEN"],
      [2, "CLOSED"],
      [3, "OPEN"],
    ]);
    expect(checkRoadmap(text, states)).toEqual({
      errors: [],
      warnings: ["warning: #2 is closed, move or remove it"],
    });
  });

  it("still checks the structure when the issue states are unavailable", () => {
    const text = roadmap(["#1, #1"], ["#2"], ["#3"]);
    const result = checkRoadmap(text, null);
    expect(result.errors).toEqual(["#1 is listed more than once"]);
    expect(result.warnings).toEqual([]);
  });

  it("does not report a missing issue when the states are unavailable", () => {
    const text = roadmap(["#1"], ["#2"], ["#3"]);
    expect(checkRoadmap(text, null).errors).toEqual([]);
  });

  it("does not read part of a longer number or a link target as an issue", () => {
    const text = roadmap(
      ["[guide](docs/guide.md#99) and #12 and #123."],
      ["#13"],
      ["#14"],
    );
    expect(checkRoadmap(text, open(12, 13, 14, 123)).errors).toEqual([]);
  });
});

describe("checkRoadmap milestones", () => {
  const text = roadmap([item(1)], [item(2)], [item(3)]);
  const milestones = (...entries: Array<[number, string]>) =>
    new Map<number, string>(entries);

  it("accepts items whose linked milestones all exist and are open", () => {
    const states = milestones([1, "OPEN"], [2, "OPEN"], [3, "OPEN"]);
    expect(checkRoadmap(text, null, states)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("reports a linked milestone that does not exist", () => {
    const states = milestones([1, "OPEN"], [3, "OPEN"]);
    expect(checkRoadmap(text, null, states).errors).toEqual([
      "milestone 2 does not exist",
    ]);
  });

  it("warns, and does not fail, for a closed milestone", () => {
    const states = milestones([1, "OPEN"], [2, "CLOSED"], [3, "OPEN"]);
    expect(checkRoadmap(text, null, states)).toEqual({
      errors: [],
      warnings: ["warning: milestone 2 is closed, remove it"],
    });
  });

  it("reports a milestone listed more than once", () => {
    const repeated = roadmap([item(1)], [item(1)], [item(3)]);
    const states = milestones([1, "OPEN"], [3, "OPEN"]);
    expect(checkRoadmap(repeated, null, states).errors).toEqual([
      "milestone 1 is listed more than once",
    ]);
  });

  it("skips the existence check when the milestones were not read", () => {
    expect(checkRoadmap(text, null, null)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("reads a milestone link only inside the three lists", () => {
    const outside = text.replace(
      "Mentions #999 outside the list.",
      `See ${MILESTONE_URL}/99.`,
    );
    const states = milestones([1, "OPEN"], [2, "OPEN"], [3, "OPEN"]);
    expect(checkRoadmap(outside, null, states).errors).toEqual([]);
  });

  it("still checks a tracker issue linked beside a milestone", () => {
    const withTracker = roadmap(
      [`${item(1)} Tracker #7.`],
      [item(2)],
      [item(3)],
    );
    const states = milestones([1, "OPEN"], [2, "OPEN"], [3, "OPEN"]);
    expect(checkRoadmap(withTracker, open(7, 8), states).errors).toEqual([]);
    expect(checkRoadmap(withTracker, open(6, 8), states).errors).toEqual([
      "#7 does not exist",
    ]);
  });
});

describe("parseIssueStates", () => {
  it("maps each issue number to its upper-case state", () => {
    const json = JSON.stringify([
      { number: 1, state: "OPEN" },
      { number: 2, state: "CLOSED" },
    ]);
    expect(parseIssueStates(json)).toEqual(
      new Map([
        [1, "OPEN"],
        [2, "CLOSED"],
      ]),
    );
  });

  it("returns null for output that is not a list of issues", () => {
    expect(parseIssueStates("not json")).toBeNull();
    expect(parseIssueStates('{"message":"rate limit"}')).toBeNull();
    expect(parseIssueStates('[{"number":"x"}]')).toBeNull();
  });

  it("returns null for an empty list, so it is never read as 'no such issue'", () => {
    expect(parseIssueStates("[]")).toBeNull();
  });
});

describe("readIssueStates", () => {
  const output = JSON.stringify([{ number: 4, state: "open" }]);

  it("asks for every issue of the project in one read-only call", () => {
    const calls: string[][] = [];
    const states = readIssueStates((args: string[]) => {
      calls.push(args);
      return { status: 0, stdout: output };
    });
    expect(states).toEqual(new Map([[4, "OPEN"]]));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      "issue",
      "list",
      "--repo",
      "MapCairn/mapcairn",
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,state",
    ]);
  });

  it("returns null when gh fails, is missing or prints something unusable", () => {
    expect(readIssueStates(() => ({ status: 1, stdout: "" }))).toBeNull();
    expect(readIssueStates(() => ({ status: null, stdout: "" }))).toBeNull();
    expect(readIssueStates(() => ({ status: 0, stdout: "[]" }))).toBeNull();
    expect(readIssueStates(() => ({ status: 0, stdout: "oops" }))).toBeNull();
  });
});

describe("parseMilestoneStates", () => {
  it("maps each milestone number to its upper-case state", () => {
    const json = JSON.stringify([
      { number: 1, state: "open", title: "A" },
      { number: 2, state: "closed", title: "B" },
    ]);
    expect(parseMilestoneStates(json)).toEqual(
      new Map([
        [1, "OPEN"],
        [2, "CLOSED"],
      ]),
    );
  });

  it("returns null for output that is not a list of milestones, or an empty list", () => {
    expect(parseMilestoneStates("not json")).toBeNull();
    expect(parseMilestoneStates('{"message":"rate limit"}')).toBeNull();
    expect(parseMilestoneStates('[{"number":"x"}]')).toBeNull();
    expect(parseMilestoneStates("[]")).toBeNull();
  });
});

describe("readMilestoneStates", () => {
  const output = JSON.stringify([{ number: 4, state: "open" }]);

  it("reads every milestone of the project in one read-only call", () => {
    const calls: string[][] = [];
    const states = readMilestoneStates((args: string[]) => {
      calls.push(args);
      return { status: 0, stdout: output };
    });
    expect(states).toEqual(new Map([[4, "OPEN"]]));
    expect(calls).toEqual([
      ["api", "repos/MapCairn/mapcairn/milestones?state=all&per_page=100"],
    ]);
  });

  it("returns null when gh fails, is missing or prints something unusable", () => {
    expect(readMilestoneStates(() => ({ status: 1, stdout: "" }))).toBeNull();
    expect(
      readMilestoneStates(() => ({ status: null, stdout: "" })),
    ).toBeNull();
    expect(readMilestoneStates(() => ({ status: 0, stdout: "[]" }))).toBeNull();
  });
});

describe("runRoadmapCheck", () => {
  const text = roadmap(["#1", item(11)], ["#2"], ["#3"]);
  const milestoneStates = new Map([[11, "OPEN"]]);

  function run(
    roadmapText: string,
    states: Map<number, string> | null,
    milestones: Map<number, string> | null = milestoneStates,
  ) {
    const out: string[] = [];
    const err: string[] = [];
    const code = runRoadmapCheck({
      roadmapText,
      states,
      milestones,
      log: (line: string) => out.push(line),
      error: (line: string) => err.push(line),
    });
    return { code, out, err };
  }

  it("exits 0 and prints nothing for a clean list", () => {
    expect(run(text, open(1, 2, 3))).toEqual({ code: 0, out: [], err: [] });
  });

  it("prints each missing milestone as an error and exits 1", () => {
    const result = run(text, open(1, 2, 3), new Map([[12, "OPEN"]]));
    expect(result.code).toBe(1);
    expect(result.err).toEqual(["roadmap check: milestone 11 does not exist"]);
  });

  it("says once that the milestones were not checked", () => {
    const result = run(text, open(1, 2, 3), null);
    expect(result.code).toBe(0);
    expect(result.out).toHaveLength(1);
    expect(result.out[0]).toMatch(
      /^roadmap check: .*milestones were not checked/,
    );
  });

  it("prints a warning with the same prefix as errors and still exits 0", () => {
    const states = new Map([
      [1, "OPEN"],
      [2, "CLOSED"],
      [3, "OPEN"],
    ]);
    expect(run(text, states)).toEqual({
      code: 0,
      out: ["roadmap check: warning: #2 is closed, move or remove it"],
      err: [],
    });
  });

  it("prints each error with the prefix and exits 1", () => {
    const result = run(roadmap(["#1, #1"], ["#2"], ["#3"]), open(1, 2, 3));
    expect(result.code).toBe(1);
    expect(result.err).toEqual(["roadmap check: #1 is listed more than once"]);
  });

  it("says once that the states were not checked, and still fails on a structural error", () => {
    const clean = run(text, null);
    expect(clean.code).toBe(0);
    expect(clean.out).toHaveLength(1);
    expect(clean.out[0]).toMatch(
      /^roadmap check: issue states were not checked/,
    );
    const broken = run(roadmap(["#1, #1"], ["#2"], ["#3"]), null);
    expect(broken.code).toBe(1);
    expect(broken.out).toHaveLength(1);
  });
});
