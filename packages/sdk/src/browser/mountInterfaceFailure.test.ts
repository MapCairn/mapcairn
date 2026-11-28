// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { EN_GB_CATALOGUE, MapEngineError } from "@mapcairn/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineElement } from "./element/defineElement";
import { mount } from "./mount";
import { container, destroyMounted, harness, mountOn } from "./testSupport";

// The part of the interface that is fetched apart has failed to load here. The
// module is named by path, not imported, so this package compiles only its own
// sources.
vi.mock("../../../map/src/lit/privateElements", () => {
  const failed = { status: "failed" };
  return {
    privateElements: {
      define: () => Promise.resolve(),
      state: () => failed,
      subscribe: () => () => undefined,
    },
  };
});

const NOTICE = EN_GB_CATALOGUE["app.banner.engineFailed"];

describe("a mounted map whose interface cannot be loaded", () => {
  afterEach(destroyMounted);

  it("rejects `ready` and reports the error once, with a notice in the map's place and no engine", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tools = harness();
    const element = container();
    const handle = mountOn(element, tools);
    const reported = vi.fn();
    handle.on("error", reported);

    const failure = await handle.ready.then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(MapEngineError);
    expect(failure).toMatchObject({ reason: "interface-load-failed" });
    expect(reported).toHaveBeenCalledExactlyOnceWith(failure);
    expect(element.querySelector("[data-map-host]")?.textContent).toBe(NOTICE);
    expect(tools.adapters).toHaveLength(0);
  });

  it("sends mapcairn-error once from the element", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tools = harness();
    defineElement("failing-interface-map", (given, options) =>
      mount(given, options, tools.dependencies),
    );
    const element = document.createElement("failing-interface-map");
    element.getBoundingClientRect = () =>
      ({ height: 300, width: 400 }) as DOMRect;
    const sent = vi.fn();
    element.addEventListener("mapcairn-error", (event) =>
      sent((event as CustomEvent).detail),
    );

    document.body.append(element);

    await vi.waitFor(() => expect(sent).toHaveBeenCalled());
    await (
      element as unknown as { map: { ready: Promise<void> } }
    ).map.ready.catch(() => undefined);
    expect(sent).toHaveBeenCalledExactlyOnceWith(expect.any(MapEngineError));
    element.remove();
  });
});
