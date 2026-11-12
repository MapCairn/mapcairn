// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AnnouncePriority,
  type Announcer,
  createAnnouncer,
  THROTTLE_MS,
} from "./announcer";

/** Every text the announcer wrote to a region, in order, with its priority. */
let written: { priority: AnnouncePriority; text: string }[] = [];
let announcer: Announcer;

const spoken = (priority: AnnouncePriority = "polite") =>
  written
    .filter((entry) => entry.priority === priority && entry.text !== "")
    .map((entry) => entry.text);

describe("the announcer's queue of messages to keep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    written = [];
    announcer = createAnnouncer({
      setText: (priority, text) => written.push({ priority, text }),
    });
  });

  afterEach(() => {
    announcer.dispose();
    vi.useRealTimers();
  });

  it("speaks a kept message and the load message that follows it inside the window", () => {
    const { announce } = announcer;
    announce("2 layers turned off. Undo available");
    vi.advanceTimersByTime(100);
    announce("2 layers turned back on", { keep: true });
    vi.advanceTimersByTime(100);
    announce("Earthquakes: 5 shown");
    announce("Earthquakes: 6 shown");
    vi.advanceTimersByTime(THROTTLE_MS * 3);
    expect(spoken()).toEqual([
      "2 layers turned off. Undo available",
      "2 layers turned back on",
      "Earthquakes: 6 shown",
    ]);
  });

  it("does not replace a kept message that waits for the window to end", () => {
    const { announce } = announcer;
    announce("Loading layers");
    vi.advanceTimersByTime(100);
    announce("1 layer in the link is not available.", { keep: true });
    vi.advanceTimersByTime(100);
    announce("Earthquakes: 5 shown");
    expect(spoken()).toEqual(["Loading layers"]);
    vi.advanceTimersByTime(THROTTLE_MS * 2);
    expect(spoken()).toEqual([
      "Loading layers",
      "1 layer in the link is not available.",
      "Earthquakes: 5 shown",
    ]);
  });

  it("speaks kept messages in the order they arrived, one per window", () => {
    const { announce } = announcer;
    announce("First", { keep: true });
    announce("Second", { keep: true });
    announce("Third", { keep: true });
    expect(spoken()).toEqual(["First"]);
    vi.advanceTimersByTime(THROTTLE_MS - 1);
    expect(spoken()).toEqual(["First"]);
    vi.advanceTimersByTime(1);
    expect(spoken()).toEqual(["First", "Second"]);
    vi.advanceTimersByTime(THROTTLE_MS);
    expect(spoken()).toEqual(["First", "Second", "Third"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still collapses repeated messages that are not kept to the latest", () => {
    const { announce } = announcer;
    announce("Zoom level 5");
    announce("Zoom level 6");
    announce("Zoom level 7");
    announce("Zoom level 8");
    vi.advanceTimersByTime(THROTTLE_MS * 3);
    expect(spoken()).toEqual(["Zoom level 5", "Zoom level 8"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets a later message that is not kept replace one that is not kept, behind a kept one", () => {
    const { announce } = announcer;
    announce("Opening");
    announce("Kept", { keep: true });
    announce("Zoom level 6");
    announce("Zoom level 7");
    vi.advanceTimersByTime(THROTTLE_MS * 3);
    expect(spoken()).toEqual(["Opening", "Kept", "Zoom level 7"]);
  });

  it("does not let a kept message replace a waiting one that is not kept", () => {
    const { announce } = announcer;
    announce("Opening");
    announce("Zoom level 6");
    announce("Kept", { keep: true });
    vi.advanceTimersByTime(THROTTLE_MS * 3);
    expect(spoken()).toEqual(["Opening", "Zoom level 6", "Kept"]);
  });

  it("keeps the polite and assertive channels apart", () => {
    const { announce } = announcer;
    announce("Polite one", { keep: true });
    announce("Polite two", { keep: true });
    announce("Urgent", { priority: "assertive" });
    expect(spoken("assertive")).toEqual(["Urgent"]);
    vi.advanceTimersByTime(THROTTLE_MS);
    expect(spoken("polite")).toEqual(["Polite one", "Polite two"]);
    expect(spoken("assertive")).toEqual(["Urgent"]);
  });

  it("drops an identical kept message that repeats inside the de-duplication window", () => {
    const { announce } = announcer;
    announce("Saved", { keep: true });
    announce("Saved", { keep: true });
    vi.advanceTimersByTime(THROTTLE_MS * 2);
    expect(spoken()).toEqual(["Saved"]);
  });

  it("stops its timers and forgets what waits when it is disposed", () => {
    const { announce, dispose } = announcer;
    announce("First", { keep: true });
    announce("Second", { keep: true });
    dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(THROTTLE_MS * 3);
    expect(spoken()).toEqual(["First"]);
  });
});
