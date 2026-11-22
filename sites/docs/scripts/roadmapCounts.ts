// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The public milestones endpoint of the project; it needs no token. */
export const MILESTONES_URL =
  "https://api.github.com/repos/MapCairn/mapcairn/milestones?state=all&per_page=100";

/** How long the build waits for GitHub before it uses the saved counts. */
const FETCH_TIMEOUT_MS = 10_000;

/** The open and closed issues of one milestone. */
export interface MilestoneCounts {
  readonly open: number;
  readonly closed: number;
}

/** The counts of every milestone, by number, and when they were read. */
export interface RoadmapSnapshot {
  /** An ISO 8601 time. */
  readonly fetchedAt: string;
  readonly milestones: Readonly<Record<string, MilestoneCounts>>;
}

/** Where the counts on the page came from. */
export type CountsSource = "github" | "saved" | "none";

/** The counts the page shows, and where they came from. */
export interface CountsResult {
  readonly source: CountsSource;
  readonly snapshot: RoadmapSnapshot | null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Reads GitHub's milestone list. An error message, an empty list or a row
 * without counts is an unusable answer and returns null: it must never read
 * as a milestone with no issues.
 * @param body - The parsed JSON of the answer.
 * @param now - The time to stamp on the counts.
 */
export function parseMilestoneCounts(
  body: unknown,
  now: Date,
): RoadmapSnapshot | null {
  if (!Array.isArray(body) || body.length === 0) {
    return null;
  }
  const milestones: Record<string, MilestoneCounts> = {};
  for (const row of body as Record<string, unknown>[]) {
    if (
      !Number.isInteger(row?.number) ||
      !isCount(row.open_issues) ||
      !isCount(row.closed_issues)
    ) {
      return null;
    }
    milestones[String(row.number)] = {
      open: row.open_issues,
      closed: row.closed_issues,
    };
  }
  return { fetchedAt: now.toISOString(), milestones };
}

/** Whether a value read from the saved file is a snapshot. */
export function isSnapshot(value: unknown): value is RoadmapSnapshot {
  const candidate = value as RoadmapSnapshot | null;
  return (
    typeof candidate?.fetchedAt === "string" &&
    typeof candidate.milestones === "object" &&
    candidate.milestones !== null &&
    Object.values(candidate.milestones).every(
      (counts) => isCount(counts?.open) && isCount(counts?.closed),
    )
  );
}

/** What {@link readSnapshot} needs. */
export interface ReadSnapshotInput {
  /** `fetch`, or a stand-in for it. */
  readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  /** The last good counts, or null when none were saved. */
  readonly saved: RoadmapSnapshot | null;
  readonly now: Date;
}

async function fetchSnapshot(
  fetchFn: ReadSnapshotInput["fetchFn"],
  now: Date,
): Promise<RoadmapSnapshot | null> {
  try {
    const response = await fetchFn(MILESTONES_URL, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return parseMilestoneCounts(await response.json(), now);
  } catch {
    return null;
  }
}

/**
 * The counts for the page: fresh from GitHub when the call works, the last
 * good ones when it does not (a rate limit, no network, an unusable answer),
 * and none when there is neither. It never throws, so a build never fails on
 * GitHub.
 * @param input - The fetch function, the saved counts and the time.
 */
export async function readSnapshot({
  fetchFn,
  saved,
  now,
}: ReadSnapshotInput): Promise<CountsResult> {
  const fresh = await fetchSnapshot(fetchFn, now);
  if (fresh) {
    return { source: "github", snapshot: fresh };
  }
  return saved
    ? { source: "saved", snapshot: saved }
    : { source: "none", snapshot: null };
}
