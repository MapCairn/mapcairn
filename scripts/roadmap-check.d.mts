// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** One ranked milestone of `ROADMAP.md`. */
export interface RoadmapItem {
  readonly track: string;
  readonly title: string;
  readonly milestone: number;
  readonly milestoneUrl: string;
  readonly trackers: readonly number[];
  readonly text: string;
}

/**
 * Reads the ranked list of `ROADMAP.md`, and throws on what
 * `npm run roadmap:check` fails without the network.
 */
export function parseRoadmap(markdown: string): {
  readonly lanes: readonly {
    readonly name: string;
    readonly items: readonly RoadmapItem[];
  }[];
  readonly reviewed: string | null;
};

/**
 * Reads every issue of the project with one `gh` call: upper-case state by
 * issue number, or null when `gh` failed or its answer was unusable.
 */
export function readIssueStates(
  runGh: (args: string[]) => { status: number | null; stdout: string },
): Map<number, string> | null;
