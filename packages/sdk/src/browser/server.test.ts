// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { MountMapError } from "./MountMapError";
import { mount } from "./mount";

/**
 * Imports the entry, which needs the built SDK packages for their stylesheets,
 * and says so when they are missing, instead of a bare resolution error.
 */
async function loadEntry() {
  try {
    return await import("./index");
  } catch (error) {
    throw new Error(
      `The entry could not be imported. If the SDK packages are not built, run \`npm run build:sdk\` once before this test file. ${String(error)}`,
    );
  }
}

describe("the browser entry on a server", () => {
  it("runs where there is no document, window or custom element registry", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
    expect(typeof customElements).toBe("undefined");
  });

  it("imports without adding a global or reading the page", async () => {
    const before = Object.getOwnPropertyNames(globalThis).sort();
    const entry = await loadEntry();
    expect(Object.getOwnPropertyNames(globalThis).sort()).toEqual(before);
    expect(Object.keys(entry).sort()).toEqual(
      [
        "LayerError",
        "LocationError",
        "MapEngineError",
        "MountMapError",
        "PortAbortError",
        "SearchError",
        "defineMapElement",
        "mountMap",
      ].sort(),
    );
  });

  it("refuses to mount, says why and builds nothing", () => {
    const createMapAdapter = vi.fn();
    let thrown: unknown;
    try {
      mount({} as never, {}, { createMapAdapter });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MountMapError);
    expect((thrown as MountMapError).kind).toBe("server");
    expect((thrown as MountMapError).message).toBe(
      "mountMap needs a browser. Call it from code that runs in the page, not on the server.",
    );
    expect(createMapAdapter).not.toHaveBeenCalled();
  });

  it("defines no element and answers undefined, and the element's own file does the same", async () => {
    const { defineMapElement } = await loadEntry();
    expect(defineMapElement()).toBeUndefined();
    expect(defineMapElement("other-map")).toBeUndefined();
    const before = Object.getOwnPropertyNames(globalThis).sort();
    await import("./element/register");
    expect(Object.getOwnPropertyNames(globalThis).sort()).toEqual(before);
    expect(typeof customElements).toBe("undefined");
  });

  it("does the same through mountMap, which is what a page imports", async () => {
    const { mountMap } = await loadEntry();
    expect(() => mountMap({} as never)).toThrow(MountMapError);
  });
});
