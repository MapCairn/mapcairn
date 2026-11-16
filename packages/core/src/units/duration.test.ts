// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { formatMessage } from "../messages/formatMessage";
import type { Message } from "../ports/messages";
import { describeDuration, formatDuration } from "./duration";

/** The English text of a message, as the live region would say it. */
const english = (value: Message) =>
  formatMessage(new FakeMessageCatalogue(), value);

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
    expect(english(formatDuration(seconds))).toBe(text);
  });

  it("treats a negative or non-finite time as no time", () => {
    expect(english(formatDuration(-5))).toBe("Under 1 min");
    expect(english(formatDuration(Number.NaN))).toBe("Under 1 min");
    expect(english(formatDuration(Number.POSITIVE_INFINITY))).toBe(
      "Under 1 min",
    );
  });
});

describe("formatDuration as a message", () => {
  it("is keys and counts, joined by the catalogue's own wording", () => {
    expect(formatDuration(3900)).toEqual({
      key: "common.followedBy",
      params: {
        first: { key: "duration.short.hour", params: { count: 1 } },
        second: { key: "duration.short.minute", params: { count: 5 } },
      },
    });
    expect(formatDuration(5)).toEqual({
      key: "duration.short.underMinute",
      params: {},
    });
  });

  it("is written in another language's words and order", () => {
    const afrikaans = new FakeMessageCatalogue({
      language: "af",
      overrides: {
        "common.followedBy": "{first} en {second}",
        "duration.short.hour": "{count} u",
        "duration.short.minute": "{count} min.",
        "duration.short.underMinute": "Minder as 1 min.",
      },
    });
    expect(formatMessage(afrikaans, formatDuration(3900))).toBe(
      "1 u en 5 min.",
    );
    expect(formatMessage(afrikaans, formatDuration(5))).toBe(
      "Minder as 1 min.",
    );
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
    expect(english(describeDuration(seconds))).toBe(text);
  });
});

describe("describeDuration as a message", () => {
  it("is keys and counts, joined by the catalogue's own wording", () => {
    expect(describeDuration(3900)).toEqual({
      key: "common.followedBy",
      params: {
        first: { key: "duration.hour", params: { count: 1 } },
        second: { key: "duration.minute", params: { count: 5 } },
      },
    });
    expect(describeDuration(5)).toEqual({
      key: "duration.underMinute",
      params: {},
    });
  });
});
