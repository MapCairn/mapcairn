import { describe, expect, it, vi } from "vitest";
import { Emitter } from "./emitter";

interface Events {
  ping: number;
  done: undefined;
}

describe("Emitter", () => {
  it("delivers payloads to subscribers of that event only", () => {
    const emitter = new Emitter<Events>();
    const ping = vi.fn();
    const done = vi.fn();
    emitter.on("ping", ping);
    emitter.on("done", done);
    emitter.emit("ping", 3);
    expect(ping).toHaveBeenCalledWith(3);
    expect(done).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const emitter = new Emitter<Events>();
    const ping = vi.fn();
    const off = emitter.on("ping", ping);
    off();
    emitter.emit("ping", 1);
    expect(ping).not.toHaveBeenCalled();
  });

  it("keeps running other handlers when one throws", () => {
    const emitter = new Emitter<Events>();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = vi.fn();
    emitter.on("ping", () => {
      throw new Error("boom");
    });
    emitter.on("ping", second);
    emitter.emit("ping", 1);
    expect(second).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("ignores events with no subscribers and clears all handlers", () => {
    const emitter = new Emitter<Events>();
    expect(() => emitter.emit("done", undefined)).not.toThrow();
    const ping = vi.fn();
    emitter.on("ping", ping);
    emitter.clear();
    emitter.emit("ping", 1);
    expect(ping).not.toHaveBeenCalled();
  });
});
