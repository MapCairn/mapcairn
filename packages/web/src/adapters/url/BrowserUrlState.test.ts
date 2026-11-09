import { runUrlStateContract } from "@karta/core/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserUrlState,
  type BrowserUrlStateOptions,
  type UrlStateTimers,
} from "./BrowserUrlState";

const VIEW = { center: { lat: -33.9249, lng: 18.4241 }, zoom: 12, bearing: 0 };

/** Timers a test advances by hand. */
class ManualTimers implements UrlStateTimers {
  #next = 1;
  readonly #scheduled = new Map<number, { callback: () => void; ms: number }>();

  setTimeout(callback: () => void, ms: number): unknown {
    const handle = this.#next++;
    this.#scheduled.set(handle, { callback, ms });
    return handle;
  }
  clearTimeout(handle: unknown): void {
    this.#scheduled.delete(handle as number);
  }
  get pending(): number {
    return this.#scheduled.size;
  }
  get delays(): number[] {
    return [...this.#scheduled.values()].map((entry) => entry.ms);
  }
  /** Fires everything scheduled. */
  runAll(): void {
    const entries = [...this.#scheduled.entries()];
    this.#scheduled.clear();
    for (const [, entry] of entries) {
      entry.callback();
    }
  }
}

const created: BrowserUrlState[] = [];

function make(options: BrowserUrlStateOptions = {}) {
  const timers = new ManualTimers();
  const url = new BrowserUrlState({ timers, ...options });
  created.push(url);
  return { url, timers };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  for (const url of created.splice(0)) {
    url.dispose();
  }
  vi.restoreAllMocks();
});

runUrlStateContract("BrowserUrlState", () => {
  const { url } = make();
  return { url, controls: { settle: async () => url.flush() } };
});

describe("BrowserUrlState", () => {
  it("reads the state from the current hash", () => {
    window.history.replaceState(
      null,
      "",
      "/#map=10/-26.2/28.04/90&basemap=dark",
    );
    const { url } = make();
    expect(url.read()).toEqual({
      view: { center: { lat: -26.2, lng: 28.04 }, zoom: 10, bearing: 90 },
      basemapId: "dark",
    });
  });

  it("does not change the address until 300 ms of quiet", () => {
    const { url, timers } = make();
    url.write({ basemapId: "liberty" });
    expect(window.location.hash).toBe("");
    expect(timers.delays).toEqual([300]);
    timers.runAll();
    expect(window.location.hash).toBe("#basemap=liberty");
  });

  it("restarts the wait on every write and applies only the last", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const { url, timers } = make();
    url.write({ basemapId: "a" });
    url.write({ basemapId: "b" });
    url.write({ basemapId: "c" });
    expect(timers.pending).toBe(1);
    timers.runAll();
    expect(replace).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#basemap=c");
  });

  it("honours a custom debounce", () => {
    const { url, timers } = make({ debounceMs: 50 });
    url.write({ basemapId: "a" });
    expect(timers.delays).toEqual([50]);
  });

  it("uses replaceState only, never pushState", () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const { url } = make();
    url.write({ view: VIEW });
    url.flush();
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("adds no history entry", () => {
    const before = window.history.length;
    const { url } = make();
    url.write({ view: VIEW, basemapId: "dark" });
    url.flush();
    expect(window.history.length).toBe(before);
  });

  it("keeps the path, the query string and history.state", () => {
    window.history.replaceState(
      { idx: 3, key: "k" },
      "",
      "/places/cape?x=1#old",
    );
    const { url } = make();
    url.write({ basemapId: "dark" });
    url.flush();
    expect(window.location.pathname).toBe("/places/cape");
    expect(window.location.search).toBe("?x=1");
    expect(window.location.hash).toBe("#basemap=dark");
    expect(window.history.state).toEqual({ idx: 3, key: "k" });
  });

  it("removes the hash, and keeps the path, when an empty value is written", () => {
    window.history.replaceState(null, "", "/a?b=1#basemap=dark");
    const { url } = make();
    url.write({});
    url.flush();
    expect(window.location.href.endsWith("/a?b=1")).toBe(true);
    expect(window.location.hash).toBe("");
  });

  it("skips the write when the hash would not change", () => {
    window.history.replaceState(null, "", "/#basemap=dark");
    const replace = vi.spyOn(window.history, "replaceState");
    const { url } = make();
    url.write({ basemapId: "dark" });
    url.flush();
    url.write({});
    url.flush();
    url.write({});
    url.flush();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("does nothing when flushed with nothing pending", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const { url } = make();
    url.flush();
    expect(replace).not.toHaveBeenCalled();
  });

  it("applies a pending write when the page is hidden", () => {
    const { url, timers } = make();
    url.write({ basemapId: "dark" });
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(window.location.hash).toBe("");
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(window.location.hash).toBe("#basemap=dark");
    expect(timers.pending).toBe(0);
  });

  it("applies a pending write on pagehide", () => {
    const { url } = make();
    url.write({ basemapId: "liberty" });
    window.dispatchEvent(new Event("pagehide"));
    expect(window.location.hash).toBe("#basemap=liberty");
  });

  it("stops listening after dispose, and drops what was pending", () => {
    const { url, timers } = make();
    url.write({ basemapId: "liberty" });
    url.dispose();
    window.dispatchEvent(new Event("pagehide"));
    expect(window.location.hash).toBe("");
    expect(timers.pending).toBe(0);
  });

  it("adds its page listeners once, on the first write", () => {
    const add = vi.spyOn(window, "addEventListener");
    const { url } = make();
    expect(add).not.toHaveBeenCalledWith("pagehide", expect.anything());
    url.write({ basemapId: "a" });
    url.write({ basemapId: "b" });
    expect(add.mock.calls.filter(([type]) => type === "pagehide")).toHaveLength(
      1,
    );
  });

  it("keeps the value and retries when replaceState throws, as Safari does when rate limited", () => {
    const replace = vi
      .spyOn(window.history, "replaceState")
      .mockImplementationOnce(() => {
        throw new DOMException("rate limited", "SecurityError");
      });
    const { url } = make();
    url.write({ basemapId: "dark" });
    expect(() => url.flush()).not.toThrow();
    expect(window.location.hash).toBe("");
    url.flush();
    expect(replace).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe("#basemap=dark");
  });

  it("does not let a failed write overwrite a newer one", () => {
    vi.spyOn(window.history, "replaceState").mockImplementationOnce(() => {
      url.write({ basemapId: "newer" });
      throw new DOMException("rate limited", "SecurityError");
    });
    const { url } = make();
    url.write({ basemapId: "older" });
    url.flush();
    url.flush();
    expect(window.location.hash).toBe("#basemap=newer");
  });

  it("is inert without a window", () => {
    const { url } = make({
      getWindow: () => undefined,
      getDocument: () => undefined,
    });
    expect(url.read()).toEqual({});
    expect(() => {
      url.write({ basemapId: "dark" });
      url.flush();
      url.dispose();
    }).not.toThrow();
  });

  it("reads an empty value when location throws", () => {
    const { url } = make({
      getWindow: () =>
        ({
          get location(): never {
            throw new Error("blocked");
          },
        }) as never,
    });
    expect(url.read()).toEqual({});
  });
});
