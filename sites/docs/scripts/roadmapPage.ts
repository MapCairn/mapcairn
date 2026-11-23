// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { CountsResult, MilestoneCounts } from "./roadmapCounts";
import type { Roadmap, RoadmapItem, RoadmapLane } from "./roadmapSource";

/** The sentence the page and its description carry, which the build check looks for. */
export const PRIORITY_NOT_SCHEDULE = "A priority, not a schedule.";

const REPOSITORY = "https://github.com/MapCairn/mapcairn";
const ROADMAP_FILE_URL = `${REPOSITORY}/blob/main/ROADMAP.md`;
const PERCENT = 100;

/** Said once above the lanes: a count of issues is not a measure of effort. */
const SIZE_NOTE =
  "Issues differ in size, so a bar is a rough guide to how far a milestone has got.";

/** What each lane means, in one line under its heading. */
const LANE_NOTES = new Map([
  ["Now", "Work under way. These run in parallel."],
  ["Next", "Needed for 1.0.0, queued behind Now, in this order."],
  ["Later", "Waits until after 1.0.0, in this order."],
]);

/** A link whose target is a path in the repository rather than an address. */
const RELATIVE_LINK = /\]\((?![a-z][a-z0-9+.-]*:|\/\/|#)([^)\s]+)\)/gi;
/** The end of the first sentence: a full stop, a question or an exclamation mark, then a capital or the end. */
const FIRST_SENTENCE = /^([\s\S]*?[.!?])(?=\s+[A-Z]|$)/;
/** What MDX would read as markup or an expression. */
const MDX_SPECIAL = /[<{]/g;

/** The date as people write it in British English, such as `22 November 2026`. */
function formatDate(isoOrDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(isoOrDate));
}

function escapeMdx(text: string): string {
  return text.replace(MDX_SPECIAL, (character) => `\\${character}`);
}

/** The one line of what a milestone is for: its first sentence, with repository links made absolute. */
function summaryOf(text: string): string {
  const sentence = FIRST_SENTENCE.exec(text)?.[1] ?? text;
  return escapeMdx(
    sentence.replace(
      RELATIVE_LINK,
      (_, path: string) => `](${REPOSITORY}/blob/main/${path})`,
    ),
  );
}

function trackersOf(item: RoadmapItem): string {
  if (item.trackers.length === 0) {
    return "";
  }
  const links = item.trackers.map(
    (number) => `[#${number}](${REPOSITORY}/issues/${number})`,
  );
  return ` · ${item.trackers.length === 1 ? "Tracker" : "Trackers"} ${links.join(", ")}`;
}

/** The progress lines of a card: a bar for the eye and the count as text. */
function progressLines(counts: MilestoneCounts | undefined): string[] {
  if (!counts) {
    return ["Issue counts are not available for this milestone."];
  }
  const total = counts.open + counts.closed;
  if (total === 0) {
    return ["No issues yet."];
  }
  const percent = Math.floor((counts.closed / total) * PERCENT);
  return [
    `<progress className="roadmap__bar" value={${counts.closed}} max={${total}} aria-hidden="true"></progress>`,
    "",
    `**${counts.closed} of ${total} issues closed (${percent}%), ${counts.open} open**`,
  ];
}

function cardOf(item: RoadmapItem, result: CountsResult): string {
  const counts = result.snapshot?.milestones[String(item.milestone)];
  const track = item.track === "" ? "Milestone" : `${item.track} milestone`;
  return [
    '<article className="roadmap__card">',
    "",
    `### ${escapeMdx(item.title)}`,
    "",
    summaryOf(item.text),
    "",
    ...progressLines(counts),
    "",
    `${track} · [View ${escapeMdx(item.title)} on GitHub](${item.milestoneUrl})${trackersOf(item)}`,
    "",
    "</article>",
  ].join("\n");
}

function laneOf(lane: RoadmapLane, result: CountsResult): string {
  const note = LANE_NOTES.get(lane.name);
  return [
    '<section className="roadmap__lane">',
    "",
    `## ${lane.name}`,
    ...(note ? ["", note] : []),
    "",
    '<div className="roadmap__cards">',
    "",
    ...lane.items.flatMap((item) => [cardOf(item, result), ""]),
    "</div>",
    "",
    "</section>",
  ].join("\n");
}

/** The sentence that says where the counts come from and when they were read. */
function freshnessOf(result: CountsResult): string {
  if (result.source === "none" || result.snapshot === null) {
    return "Issue counts could not be read when this site was built.";
  }
  const date = formatDate(result.snapshot.fetchedAt);
  return result.source === "github"
    ? `Issue counts were fetched from GitHub on ${date}.`
    : `GitHub could not be reached when this site was built, so the issue counts are the last good read, from ${date}.`;
}

/**
 * The text of the roadmap page: a docs page whose source is Markdown with a
 * few plain elements for the cards, so the build gives it a search entry, a
 * Markdown copy and an `llms-full.txt` entry like any other page. The copy
 * drops the elements and keeps the text.
 * @param roadmap - The ranked list from `ROADMAP.md`.
 * @param result - The issue counts and where they came from.
 */
export function buildRoadmapPage(
  roadmap: Roadmap,
  result: CountsResult,
): string {
  const reviewed = roadmap.reviewed
    ? ` The file was last reviewed on ${formatDate(roadmap.reviewed)}.`
    : "";
  return [
    "---",
    "title: Roadmap",
    "sidebar_label: Roadmap",
    `description: What MapCairn works on now, next and later, and how far each milestone has got. ${PRIORITY_NOT_SCHEDULE}`,
    `custom_edit_url: ${ROADMAP_FILE_URL.replace("/blob/", "/edit/")}`,
    "hide_table_of_contents: true",
    "---",
    "",
    "# Roadmap",
    "",
    `${PRIORITY_NOT_SCHEDULE} The milestones below are ranked in the order the work is meant to be done. Nothing here has a date or is a promise, and the order can change.`,
    "",
    `This page is built from [\`ROADMAP.md\`](${ROADMAP_FILE_URL}), which is where it is edited.${reviewed} ${freshnessOf(result)} The browser makes no request to GitHub to show it.`,
    "",
    SIZE_NOTE,
    "",
    '<div className="roadmap">',
    "",
    '<div className="roadmap__lanes">',
    "",
    ...roadmap.lanes.flatMap((lane) => [laneOf(lane, result), ""]),
    "</div>",
    "",
    "</div>",
    "",
  ].join("\n");
}
