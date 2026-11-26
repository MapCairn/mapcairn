// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeMapAdapterFactory } from "@mapcairn/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const adapterFactory = vi.hoisted(() => vi.fn());

vi.mock("@mapcairn/adapter-maplibre", () => ({
  createMapLibreMapAdapter: adapterFactory,
}));

import { mountMap } from "./mountMap";

afterEach(() => {
  document.body.replaceChildren();
  adapterFactory.mockReset();
});

function container(): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({ height: 300, width: 400 }) as DOMRect;
  document.body.append(element);
  return element;
}

describe("mountMap", () => {
  it("gives the MapLibre adapter the worker the page names, and nothing else to load", async () => {
    const factory = createFakeMapAdapterFactory();
    adapterFactory.mockImplementation(() => factory());
    const handle = mountMap(container(), {
      workerUrl: "/mapcairn/browser-worker.js",
    });
    await handle.ready;
    expect(adapterFactory).toHaveBeenCalledTimes(1);
    const options: { loadWorkerUrl: () => Promise<string> } =
      adapterFactory.mock.calls[0]?.[0];
    const { loadWorkerUrl } = options;
    await expect(loadWorkerUrl()).resolves.toBe(
      new URL("/mapcairn/browser-worker.js", document.baseURI).href,
    );
    handle.destroy();
  });

  it("looks for the worker beside its own module when the page names none, and refuses it off this origin", () => {
    // Under test the module is a file on disk, which is not the page's origin.
    expect(() => mountMap(container())).toThrow(
      /workerUrl must be on this page's origin/,
    );
  });
});
