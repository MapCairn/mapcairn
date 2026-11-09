import {
  createFakeServices,
  emptyLayerRegistry,
  FakeClipboard,
  FakeSearchProvider,
  type Services,
  StaticLayerRegistry,
} from "@karta/core";
import { PORT_NAMES } from "@karta/core/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapLibreMapAdapter } from "../adapters/maplibre/MapLibreMapAdapter";
import { createServices } from "./createServices";

afterEach(() => {
  Reflect.deleteProperty(window, "__KARTA_TEST_SERVICES__");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createServices", () => {
  it("returns a complete Services with every port", () => {
    const services = createServices();
    for (const name of PORT_NAMES) {
      expect(services[name], name).toBeDefined();
    }
    expect(Object.keys(services).sort()).toEqual([...PORT_NAMES].sort());
  });

  it("builds real adapters that answer without touching the network", () => {
    const services = createServices();
    expect(["light", "dark"]).toContain(services.theme.getSystemTheme());
    expect(services.settings.get().units).toBe("metric");
    expect(services.preferences.get()).toHaveProperty("reducedMotion");
    expect(services.layers.list()).toEqual([]);
    expect(services.url.read()).toEqual({});
  });

  it("lists no layers, through the shared empty registry rather than a fake", () => {
    const { layers } = createServices();
    expect(layers).toBe(emptyLayerRegistry);
    expect(layers).not.toBeInstanceOf(StaticLayerRegistry);
  });

  it("returns a fresh object, with fresh adapters, on every call", () => {
    const first = createServices();
    const second = createServices();
    expect(second).not.toBe(first);
    expect(second.settings).not.toBe(first.settings);
    expect(second.search).not.toBe(first.search);
  });

  it("builds a new MapLibre adapter on every call", () => {
    const { createMapAdapter } = createServices();
    const first = createMapAdapter();
    expect(first).toBeInstanceOf(MapLibreMapAdapter);
    expect(createMapAdapter()).not.toBe(first);
  });

  describe("overrides", () => {
    it("wins over the real services and leaves the others alone", () => {
      const search = new FakeSearchProvider();
      const services = createServices({ overrides: { search } });
      expect(services.search).toBe(search);
      expect(services.settings.get().units).toBe("metric");
    });

    it("accepts every service, including the map adapter factory", () => {
      const fakes = createFakeServices();
      const { fakes: _handles, ...replacement } = fakes;
      const services = createServices({ overrides: replacement });
      for (const name of PORT_NAMES) {
        expect(services[name], name).toBe(replacement[name]);
      }
    });

    it("ignores entries that are undefined", () => {
      const services = createServices({
        overrides: { search: undefined } as Partial<Services>,
      });
      expect(services.search).toBeDefined();
    });
  });

  describe("test seam", () => {
    it("merges window.__KARTA_TEST_SERVICES__ over the real services", () => {
      const search = new FakeSearchProvider();
      const clipboard = new FakeClipboard();
      window.__KARTA_TEST_SERVICES__ = { search, clipboard };
      const info = vi
        .spyOn(console, "info")
        .mockImplementation(() => undefined);
      const services = createServices();
      expect(services.search).toBe(search);
      expect(services.clipboard).toBe(clipboard);
      expect(services.settings.get().units).toBe("metric");
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("KARTA_TEST_SEAM_MARKER"),
      );
    });

    it("lets explicit overrides win over the seam", () => {
      const fromSeam = new FakeSearchProvider();
      const fromCode = new FakeSearchProvider();
      window.__KARTA_TEST_SERVICES__ = { search: fromSeam };
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      expect(createServices({ overrides: { search: fromCode } }).search).toBe(
        fromCode,
      );
    });

    it("accepts a map adapter factory function", () => {
      const factory = vi.fn();
      window.__KARTA_TEST_SERVICES__ = { createMapAdapter: factory };
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      expect(createServices().createMapAdapter).toBe(factory);
    });

    it("ignores input that is not a plain object", () => {
      const real = createServices().search.constructor;
      for (const malformed of [
        "search",
        42,
        null,
        undefined,
        true,
        [new FakeSearchProvider()],
      ]) {
        window.__KARTA_TEST_SERVICES__ = malformed;
        expect(createServices().search.constructor).toBe(real);
      }
    });

    it("drops entries of the wrong kind and unknown keys, and keeps the good ones", () => {
      const clipboard = new FakeClipboard();
      window.__KARTA_TEST_SERVICES__ = {
        search: "not a service",
        location: null,
        createMapAdapter: { not: "a function" },
        settings: 7,
        unknown: new FakeSearchProvider(),
        clipboard,
      };
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      const services = createServices();
      expect(services.clipboard).toBe(clipboard);
      expect(typeof services.search.search).toBe("function");
      expect(typeof services.createMapAdapter).toBe("function");
      expect(services.settings.get().units).toBe("metric");
      expect(services).not.toHaveProperty("unknown");
    });

    it("stays quiet when nothing in the seam is usable", () => {
      window.__KARTA_TEST_SERVICES__ = { search: "nope" };
      const info = vi.spyOn(console, "info");
      createServices();
      expect(info).not.toHaveBeenCalled();
    });

    it("is ignored in a production build", () => {
      vi.stubEnv("MODE", "production");
      const search = new FakeSearchProvider();
      window.__KARTA_TEST_SERVICES__ = { search };
      expect(createServices().search).not.toBe(search);
    });

    it("applies in the e2e and development modes", () => {
      for (const mode of ["e2e", "development"]) {
        vi.stubEnv("MODE", mode);
        const search = new FakeSearchProvider();
        window.__KARTA_TEST_SERVICES__ = { search };
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        expect(createServices().search).toBe(search);
      }
    });
  });
});
