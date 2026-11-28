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

  it("says the load failed, reports why, and tries again when asked again", async () => {
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

    expect(definition.state()).toEqual({ status: "failed" });
    expect(error).toHaveBeenCalledWith(expect.any(String), reason);
    expect(listener).toHaveBeenCalledTimes(1);

    await definition.define();

    expect(definition.state()).toEqual({ status: "ready", value: "tags" });
    error.mockRestore();
  });

  it("stops telling a listener that has unsubscribed", async () => {
    const definition = createLazyDefinition(() => Promise.resolve("tags"));
    const listener = vi.fn();
    definition.subscribe(listener)();

    await definition.define();

    expect(listener).not.toHaveBeenCalled();
  });
});
