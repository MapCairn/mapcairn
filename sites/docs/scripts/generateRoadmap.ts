// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type CountsResult,
  isSnapshot,
  type ReadSnapshotInput,
  type RoadmapSnapshot,
  readSnapshot,
} from "./roadmapCounts";
import { buildRoadmapPage } from "./roadmapPage";
import { parseRoadmap } from "./roadmapSource";

/** The roadmap of the repository, which the page is built from. */
const ROADMAP_FILE = fileURLToPath(
  new URL("../../../ROADMAP.md", import.meta.url),
);

/** The last good issue counts. It is committed, so a build with no network still shows counts. */
export const SNAPSHOT_FILE = fileURLToPath(
  new URL("../roadmap-counts.json", import.meta.url),
);

/** The page, written into the docs folder. It is git-ignored: `ROADMAP.md` is the source. */
const PAGE_FILE = fileURLToPath(new URL("../docs/roadmap.md", import.meta.url));

/** What {@link generateRoadmap} needs. */
export interface GenerateRoadmapInput {
  /** The text of `ROADMAP.md`. */
  readonly roadmapText: string;
  /** The text of the saved counts file, or null when there is none. */
  readonly savedText: string | null;
  readonly fetchFn: ReadSnapshotInput["fetchFn"];
  readonly now: Date;
}

/** The page and the counts it shows. */
export interface GeneratedRoadmap extends CountsResult {
  readonly page: string;
}

/** The saved counts, or null when the text is missing or is not a snapshot. */
function parseSaved(text: string | null): RoadmapSnapshot | null {
  if (text === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    return isSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Builds the roadmap page from `ROADMAP.md` and the issue counts. It throws
 * when the roadmap is not well formed (as `npm run roadmap:check` would), and
 * never because of GitHub: a failed read uses the saved counts, or shows none.
 * @param input - The roadmap, the saved counts, the fetch function and the time.
 */
export async function generateRoadmap({
  roadmapText,
  savedText,
  fetchFn,
  now,
}: GenerateRoadmapInput): Promise<GeneratedRoadmap> {
  const roadmap = parseRoadmap(roadmapText);
  const result = await readSnapshot({
    fetchFn,
    saved: parseSaved(savedText),
    now,
  });
  return { ...result, page: buildRoadmapPage(roadmap, result) };
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Writes the page, and the counts when GitHub gave fresh ones. */
async function main(): Promise<void> {
  const generated = await generateRoadmap({
    roadmapText: readFileSync(ROADMAP_FILE, "utf8"),
    savedText: readIfExists(SNAPSHOT_FILE),
    fetchFn: fetch,
    now: new Date(),
  });
  writeFileSync(PAGE_FILE, generated.page);
  if (generated.source === "github") {
    writeFileSync(
      SNAPSHOT_FILE,
      `${JSON.stringify(generated.snapshot, null, 2)}\n`,
    );
  }
  console.log(`Roadmap page written; issue counts: ${generated.source}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
