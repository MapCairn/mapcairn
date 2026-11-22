// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  MILESTONES_URL,
  parseMilestoneCounts,
  readSnapshot,
} from "./roadmapCounts";

const NOW = new Date("2026-11-22T10:30:00Z");

const apiAnswer = (...rows: object[]) =>
  new Response(JSON.stringify(rows), { status: 200 });

describe("parseMilestoneCounts", () => {
  it("reads the open and closed counts by milestone number and stamps the time", () => {
    const snapshot = parseMilestoneCounts(
      [
        { number: 5, open_issues: 8, closed_issues: 4, title: "x" },
        { number: 6, open_issues: 0, closed_issues: 0 },
      ],
      NOW,
    );
    expect(snapshot).toEqual({
      fetchedAt: "2026-11-22T10:30:00.000Z",
      milestones: {
        "5": { open: 8, closed: 4 },
        "6": { open: 0, closed: 0 },
      },
    });
  });

  it.each([
    ["an error message", { message: "API rate limit exceeded" }],
    ["an empty list", []],
    ["a row without counts", [{ number: 5 }]],
    ["a negative count", [{ number: 5, open_issues: -1, closed_issues: 0 }]],
    ["text", "nope"],
  ])("returns null for %s, so it never reads as zero issues", (_, body) => {
    expect(parseMilestoneCounts(body, NOW)).toBeNull();
  });
});

describe("readSnapshot", () => {
  const saved = {
    fetchedAt: "2026-11-01T00:00:00.000Z",
    milestones: { "5": { open: 1, closed: 1 } },
  };

  it("asks the public API without a credential and returns fresh counts", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const result = await readSnapshot({
      fetchFn: async (url, init) => {
        calls.push({ url: String(url), init });
        return apiAnswer({ number: 5, open_issues: 2, closed_issues: 3 });
      },
      saved: null,
      now: NOW,
    });
    expect(result.source).toBe("github");
    expect(result.snapshot?.milestones["5"]).toEqual({ open: 2, closed: 3 });
    expect(calls[0]?.url).toBe(MILESTONES_URL);
    expect(JSON.stringify(calls[0]?.init?.headers ?? {})).not.toMatch(
      /authorization/i,
    );
  });

  it.each([
    ["the network failing", async () => Promise.reject(new Error("offline"))],
    ["a rate limit", async () => new Response("{}", { status: 403 })],
    [
      "an unusable answer",
      async () => new Response('{"message":"x"}', { status: 200 }),
    ],
    [
      "a body that is not JSON",
      async () => new Response("<html>", { status: 200 }),
    ],
  ])("falls back to the saved counts after %s", async (_, fetchFn) => {
    const result = await readSnapshot({ fetchFn, saved, now: NOW });
    expect(result).toEqual({ source: "saved", snapshot: saved });
  });

  it("returns no counts at all when the call fails and nothing is saved", async () => {
    const result = await readSnapshot({
      fetchFn: async () => Promise.reject(new Error("offline")),
      saved: null,
      now: NOW,
    });
    expect(result).toEqual({ source: "none", snapshot: null });
  });
});
