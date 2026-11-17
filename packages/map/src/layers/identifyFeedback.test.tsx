// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDENTIFY_FEEDBACK_MS, useIdentifyFeedback } from "./identifyFeedback";

describe("useIdentifyFeedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("waits for the delay before it says to show the line", () => {
    const { result } = renderHook(
      ({ identifying }) => useIdentifyFeedback(identifying),
      { initialProps: { identifying: true } },
    );
    expect(result.current).toBe(false);
    advance(IDENTIFY_FEEDBACK_MS - 1);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
  });

  it("never shows a lookup that answers in time, and starts over for the next one", () => {
    const { result, rerender } = renderHook(
      ({ identifying }) => useIdentifyFeedback(identifying),
      { initialProps: { identifying: true } },
    );
    advance(IDENTIFY_FEEDBACK_MS - 1);
    rerender({ identifying: false });
    advance(IDENTIFY_FEEDBACK_MS);
    expect(result.current).toBe(false);
    rerender({ identifying: true });
    advance(IDENTIFY_FEEDBACK_MS - 1);
    expect(result.current).toBe(false);
  });

  it("hides the line at once when the lookup ends", () => {
    const { result, rerender } = renderHook(
      ({ identifying }) => useIdentifyFeedback(identifying),
      { initialProps: { identifying: true } },
    );
    advance(IDENTIFY_FEEDBACK_MS);
    expect(result.current).toBe(true);
    rerender({ identifying: false });
    expect(result.current).toBe(false);
  });

  it("is not set off by a lookup that never starts", () => {
    const { result } = renderHook(() => useIdentifyFeedback(false));
    advance(IDENTIFY_FEEDBACK_MS * 3);
    expect(result.current).toBe(false);
  });
});
