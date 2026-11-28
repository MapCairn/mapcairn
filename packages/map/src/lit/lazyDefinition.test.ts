// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { createLazyDefinition } from "./lazyDefinition";

/** A load that finishes when the test says so. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

describe("createLazyDefinition", () => {
  it("loads nothing until it is asked to define", () => {
    const load = vi.fn(() => Promise.resolve("tags"));

    const definition = createLazyDefinition(load);

    expect(load).not.toHaveBeenCalled();
    expect(definition.state()).toEqual({ status: "loading" });
  });

  it("loads once however often it is asked, and tells its listeners", async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const definition = createLazyDefinition(load);
    const listener = vi.fn();
    definition.subscribe(listener);

    const first = definition.define();
    const second = definition.define();
    expect(listener).not.toHaveBeenCalled();
    pending.resolve("tags");
    await Promise.all([first, second]);
    await definition.define();

    expect(load).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(definition.state()).toEqual({ status: "ready", value: "tags" });
  });

  it("gives the same state object until it changes, as a React store must", async () => {
    const definition = createLazyDefinition(() => Promise.resolve("tags"));
    expect(definition.state()).toBe(definition.state());

    await definition.define();

    expect(definition.state()).toBe(definition.state());
  });

  it("says the load failed, reports why, and stays failed however it is asked again", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const reason = new Error("offline");
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(reason)
      .mockResolvedValue("tags");
    const definition = createLazyDefinition(load);
    const listener = vi.fn();
    definition.subscribe(listener);

    await definition.define();
    await definition.define();

    expect(definition.state()).toEqual({ status: "failed" });
    expect(load).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.any(String), reason);
    expect(listener).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("gives up on a load that never settles, at the bound and not before", async () => {
    vi.useFakeTimers();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const definition = createLazyDefinition(
      () => new Promise<string>(() => undefined),
      { timeoutMs: 1000 },
    );
    const settled = vi.fn();
    void definition.define().then(settled);

    await vi.advanceTimersByTimeAsync(999);
    expect(definition.state()).toEqual({ status: "loading" });
    await vi.advanceTimersByTimeAsync(1);

    expect(definition.state()).toEqual({ status: "failed" });
    expect(settled).toHaveBeenCalled();
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({ message: "Nothing arrived within 1000 ms." }),
    );
    error.mockRestore();
    vi.useRealTimers();
  });

  it("ignores a load that arrives after it gave up, so what the page said stays true", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pending = deferred<string>();
    const definition = createLazyDefinition(() => pending.promise, {
      timeoutMs: 1000,
    });
    const listener = vi.fn();
    definition.subscribe(listener);
    void definition.define();
    await vi.advanceTimersByTimeAsync(1000);

    pending.resolve("tags");
    await vi.advanceTimersByTimeAsync(0);

    expect(definition.state()).toEqual({ status: "failed" });
    expect(listener).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("leaves no timer behind once the load has arrived", async () => {
    vi.useFakeTimers();
    const definition = createLazyDefinition(() => Promise.resolve("tags"), {
      timeoutMs: 1000,
    });

    await definition.define();

    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("stops telling a listener that has unsubscribed", async () => {
    const definition = createLazyDefinition(() => Promise.resolve("tags"));
    const listener = vi.fn();
    definition.subscribe(listener)();

    await definition.define();

    expect(listener).not.toHaveBeenCalled();
  });
});
