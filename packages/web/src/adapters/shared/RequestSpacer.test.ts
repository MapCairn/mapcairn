import { PortAbortError } from "@mapcairn/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestSpacer } from "./RequestSpacer";

describe("RequestSpacer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function track(promise: Promise<void>) {
    const state = { settled: false, error: undefined as unknown };
    promise.then(
      () => {
        state.settled = true;
      },
      (error: unknown) => {
        state.settled = true;
        state.error = error;
      },
    );
    return state;
  }

  it("lets the first request start at once", async () => {
    const spacer = new RequestSpacer(1000);

    const first = track(spacer.wait());
    await vi.advanceTimersByTimeAsync(0);

    expect(first.settled).toBe(true);
  });

  it("starts queued requests at least the interval apart, in order", async () => {
    const spacer = new RequestSpacer(1000);
    const started: number[] = [];

    for (const index of [1, 2, 3]) {
      void spacer.wait().then(() => started.push(index));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1]);

    await vi.advanceTimersByTimeAsync(999);
    expect(started).toEqual([1]);

    await vi.advanceTimersByTimeAsync(1);
    expect(started).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toEqual([1, 2, 3]);
  });

  it("lets a request start at once when the last one was long enough ago", async () => {
    const spacer = new RequestSpacer(1000);
    await spacer.wait();
    await vi.advanceTimersByTimeAsync(1500);

    const later = track(spacer.wait());
    await vi.advanceTimersByTimeAsync(0);

    expect(later.settled).toBe(true);
  });

  it("rejects at once with an abort error when the signal fires while queued", async () => {
    const spacer = new RequestSpacer(1000);
    await spacer.wait();
    const controller = new AbortController();

    const queued = track(spacer.wait(controller.signal));
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(queued.error).toBeInstanceOf(PortAbortError);
  });

  it("rejects a wait whose signal has already fired, without taking a turn", async () => {
    const spacer = new RequestSpacer(1000);
    const controller = new AbortController();
    controller.abort();

    await expect(spacer.wait(controller.signal)).rejects.toBeInstanceOf(
      PortAbortError,
    );
    const next = track(spacer.wait());
    await vi.advanceTimersByTimeAsync(0);
    expect(next.settled).toBe(true);
  });

  it("does not hold later requests behind an aborted one", async () => {
    const spacer = new RequestSpacer(1000);
    await spacer.wait();
    const controller = new AbortController();
    const aborted = track(spacer.wait(controller.signal));
    const after = track(spacer.wait());

    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);

    expect(aborted.error).toBeInstanceOf(PortAbortError);
    expect(after.settled).toBe(true);
    expect(after.error).toBeUndefined();
  });

  it("spaces nothing with an interval of zero", async () => {
    const spacer = new RequestSpacer(0);

    const first = track(spacer.wait());
    const second = track(spacer.wait());
    await vi.advanceTimersByTimeAsync(0);

    expect(first.settled && second.settled).toBe(true);
  });
});
