// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { parseRoadmap as parseRoadmapSource } from "../../../scripts/roadmap-check.mjs";

/** One ranked milestone, as `ROADMAP.md` lists it. */
export interface RoadmapItem {
  /** `SDK` or `Site`. */
  readonly track: string;
  readonly title: string;
  readonly milestone: number;
  /** The milestone's address, as the item links it. */
  readonly milestoneUrl: string;
  /** The issue numbers the item names, in order. */
  readonly trackers: readonly number[];
  /** What the milestone is for. */
  readonly text: string;
}

/** The Now, Next or Later list. */
export interface RoadmapLane {
  readonly name: string;
  readonly items: readonly RoadmapItem[];
}

/** The ranked list of `ROADMAP.md`. */
export interface Roadmap {
  readonly lanes: readonly RoadmapLane[];
  /** The date of the last review, `YYYY-MM-DD`, or null. */
  readonly reviewed: string | null;
}

/**
 * Reads the ranked list with the parser behind `npm run roadmap:check`, which
 * throws on a list that check would fail on without the network.
 * @param markdown - The text of `ROADMAP.md`.
 */
export function parseRoadmap(markdown: string): Roadmap {
  return parseRoadmapSource(markdown);
}
