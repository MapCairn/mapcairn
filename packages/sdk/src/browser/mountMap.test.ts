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

  it("starts the engine's worker from one blob made from the bundle's own copy when the page names none", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:http://localhost:3000/worker");
    adapterFactory.mockImplementation(() => createFakeMapAdapterFactory()());
    const first = mountMap(container());
    const second = mountMap(container());
    await Promise.all([first.ready, second.ready]);
    for (const [options] of adapterFactory.mock.calls) {
      await expect(options.loadWorkerUrl()).resolves.toBe(
        "blob:http://localhost:3000/worker",
      );
    }
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0] ?? [];
    expect((blob as Blob).type).toBe("text/javascript");
    first.destroy();
    second.destroy();
  });
});
