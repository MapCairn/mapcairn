// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { MountMapError } from "./MountMapError";
import { mount } from "./mount";

describe("the browser entry on a server", () => {
  it("runs where there is no document, window or custom element registry", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
    expect(typeof customElements).toBe("undefined");
  });

  it("imports without adding a global or reading the page", async () => {
    const before = Object.getOwnPropertyNames(globalThis).sort();
    const entry = await import("./index");
    expect(Object.getOwnPropertyNames(globalThis).sort()).toEqual(before);
    expect(Object.keys(entry).sort()).toEqual(
      [
        "LayerError",
        "LocationError",
        "MapEngineError",
        "MountMapError",
        "PortAbortError",
        "SearchError",
        "mountMap",
      ].sort(),
    );
  });

  it("refuses to mount, says why and builds nothing", () => {
    const createMapAdapter = vi.fn();
    const defaultWorkerUrl = vi.fn();
    let thrown: unknown;
    try {
      mount({} as never, {}, { createMapAdapter, defaultWorkerUrl });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MountMapError);
    expect((thrown as MountMapError).kind).toBe("server");
    expect((thrown as MountMapError).message).toBe(
      "mountMap needs a browser. Call it from code that runs in the page, not on the server.",
    );
    expect(createMapAdapter).not.toHaveBeenCalled();
    expect(defaultWorkerUrl).not.toHaveBeenCalled();
  });

  it("does the same through mountMap, which is what a page imports", async () => {
    const { mountMap } = await import("./index");
    expect(() => mountMap({} as never)).toThrow(MountMapError);
  });
});
