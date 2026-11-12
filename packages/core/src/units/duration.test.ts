// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { describeDuration, formatDuration } from "./duration";

describe("formatDuration", () => {
  it.each([
    [0, "Under 1 min"],
    [29, "Under 1 min"],
    [30, "1 min"],
    [89, "1 min"],
    [90, "2 min"],
    [1080, "18 min"],
    [3540, "59 min"],
    [3599, "1 h"],
    [3600, "1 h"],
    [3900, "1 h 5 min"],
    [7200, "2 h"],
    [86_400, "1 d"],
    [90_000, "1 d 1 h"],
    [183_600, "2 d 3 h"],
  ])("writes %d seconds as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it("treats a negative or non-finite time as no time", () => {
    expect(formatDuration(-5)).toBe("Under 1 min");
    expect(formatDuration(Number.NaN)).toBe("Under 1 min");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("Under 1 min");
  });
});

describe("describeDuration", () => {
  it.each([
    [10, "under a minute"],
    [60, "1 minute"],
    [1080, "18 minutes"],
    [3600, "1 hour"],
    [3900, "1 hour 5 minutes"],
    [7260, "2 hours 1 minute"],
    [90_000, "1 day 1 hour"],
    [172_800, "2 days"],
  ])("says %d seconds as %s", (seconds, text) => {
    expect(describeDuration(seconds)).toBe(text);
  });
});
