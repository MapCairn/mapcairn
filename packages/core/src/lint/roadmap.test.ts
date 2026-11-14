// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  checkRoadmap,
  parseIssueStates,
  // @ts-expect-error The scripts are dependency-free JavaScript with JSDoc types.
} from "../../../../scripts/roadmap-check.mjs";

/** A roadmap with a Priorities section, built from the three lists. */
function roadmap(now: string[], next: string[], later: string[]): string {
  const list = (items: string[]) =>
    items.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return [
    "# Roadmap",
    "## Direction",
    "Mentions #999 outside the list.",
    "## Priorities",
    "Intro with no issue numbers.",
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

describe("checkRoadmap", () => {
  it("accepts a list whose issues all exist and are open", () => {
    const text = roadmap(["**SDK, #1.** One."], ["**Site, #2.** Two."], ["#3"]);
    expect(checkRoadmap(text, open(1, 2, 3))).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("ignores issue numbers outside the Priorities section", () => {
    const text = roadmap(["#1"], ["#2"], ["#3"]);
    expect(checkRoadmap(text, open(1, 2, 3)).errors).toEqual([]);
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

  it("reports more than five numbered items under Now", () => {
    const text = roadmap(["#1", "#2", "#3", "#4", "#5", "#6"], ["#7"], ["#8"]);
    const { errors } = checkRoadmap(text, open(1, 2, 3, 4, 5, 6, 7, 8));
    expect(errors).toEqual(["Now has 6 items, at most 5 are allowed"]);
  });

  it("accepts exactly five items under Now", () => {
    const text = roadmap(["#1", "#2", "#3", "#4", "#5"], ["#6"], ["#7"]);
    expect(checkRoadmap(text, open(1, 2, 3, 4, 5, 6, 7)).errors).toEqual([]);
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
});
