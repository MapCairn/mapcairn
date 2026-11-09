import { describe, expect, it } from "vitest";
import { PORT_NAMES } from "../contracts/portRegistry";
import type { Services } from "../ports/services";
import { createFakeServices } from "./createFakeServices";
import { FakeClipboard } from "./FakeClipboard";
import { FakeMapAdapter } from "./FakeMapAdapter";
import { SAMPLE_FEED_LAYER } from "./layerFixtures";
import { StaticLayerRegistry } from "./StaticLayerRegistry";

describe("createFakeServices", () => {
  it("provides every service and the handles to script them", () => {
    const services = createFakeServices();
    for (const name of PORT_NAMES) {
      expect(services[name]).toBeDefined();
    }
    expect(services.search).toBe(services.fakes.search);
    expect(services.location).toBe(services.fakes.location);
    expect(services.settings).toBe(services.fakes.settings);
    expect(services.clipboard).toBe(services.fakes.clipboard);
    expect(services.url).toBe(services.fakes.url);
    expect(services.theme).toBe(services.fakes.theme);
    expect(services.layers).toBe(services.fakes.layers);
  });

  it("uses an override instead of the fake, leaving the fake available", () => {
    const clipboard = new FakeClipboard();
    const layers = new StaticLayerRegistry([SAMPLE_FEED_LAYER]);
    const services = createFakeServices({ clipboard, layers });
    expect(services.clipboard).toBe(clipboard);
    expect(services.layers).toBe(layers);
    expect(services.fakes.clipboard).not.toBe(clipboard);
    expect(services.search).toBe(services.fakes.search);
  });

  it("replaces the map adapter factory when told to", () => {
    const create: Services["createMapAdapter"] = () => {
      throw new Error("not used");
    };
    expect(
      createFakeServices({ createMapAdapter: create }).createMapAdapter,
    ).toBe(create);
  });

  it("builds fake map adapters and records them", () => {
    const services = createFakeServices();
    const first = services.createMapAdapter();
    const second = services.createMapAdapter();
    expect(first).toBeInstanceOf(FakeMapAdapter);
    expect(services.fakes.maps).toEqual([first, second]);
  });

  it("gives each call fresh fakes", () => {
    expect(createFakeServices().fakes.search).not.toBe(
      createFakeServices().fakes.search,
    );
  });
});
