import {
  BUILT_IN_BASEMAP_CATALOGUE,
  createFakeServices,
  FakeClipboard,
  FakeRoutingProvider,
  FakeSearchProvider,
  type Services,
  StaticLayerRegistry,
} from "@mapcairn/core";
import {
  DATA_SERVICE_NAMES,
  PORT_NAMES,
  type PortName,
} from "@mapcairn/core/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserFileOpener } from "../adapters/files/BrowserFileOpener";
import { MapLibreMapAdapter } from "../adapters/maplibre/MapLibreMapAdapter";
import { ValhallaRoutingProvider } from "../adapters/routing/ValhallaRoutingProvider";
import { HOST_BASEMAP_CATALOGUE } from "../basemaps/hostBasemaps";
import { LAYER_DEFINITIONS } from "../layers";
import { createServices } from "./createServices";

afterEach(() => {
  Reflect.deleteProperty(window, "__MAPCAIRN_TEST_SERVICES__");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createServices", () => {
  it("returns a complete Services with every port, the optional routing port included", () => {
    const services = createServices();
    for (const name of PORT_NAMES) {
      expect(services[name as PortName], name).toBeDefined();
    }
    // `basemaps` is plain data, the built-in catalogue, not a port.
    expect(Object.keys(services).sort()).toEqual(
      [...PORT_NAMES, ...DATA_SERVICE_NAMES].sort(),
    );
  });

  it("offers the site's five basemaps, not the SDK's seven, with Bright the default", () => {
    const { basemaps } = createServices();
    expect(basemaps).toBe(HOST_BASEMAP_CATALOGUE);
    expect(basemaps).not.toBe(BUILT_IN_BASEMAP_CATALOGUE);
    expect(basemaps?.basemaps.map((basemap) => basemap.id)).toEqual([
      "bright",
      "positron",
      "osm",
      "topographic",
      "dark",
    ]);
    expect(basemaps?.get("fiord")).toBeUndefined();
    expect(basemaps?.resolve("fiord").id).toBe("bright");
    expect(basemaps?.defaultId).toBe("bright");
  });

  it("builds the browser file opener, which shows nothing until it is asked", () => {
    expect(createServices().fileOpener).toBeInstanceOf(BrowserFileOpener);
  });

  it("builds the Valhalla routing provider, which sends nothing until a route is asked for", () => {
    expect(createServices().routing).toBeInstanceOf(ValhallaRoutingProvider);
  });

  it("builds real adapters that answer without touching the network", () => {
    const services = createServices();
    expect(["light", "dark"]).toContain(services.theme.getSystemTheme());
    expect(services.settings.get().units).toBe("metric");
    expect(services.preferences.get()).toHaveProperty("reducedMotion");
    expect(services.layers.list()).toEqual(LAYER_DEFINITIONS);
    expect(services.url.read()).toEqual({});
  });

  it("lists the host's layer definitions, through a real registry rather than a fake", () => {
    const { layers } = createServices();
    expect(layers.list().length).toBeGreaterThan(0);
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

    it("replaces the routing provider", () => {
      const routing = new FakeRoutingProvider();
      const services = createServices({ overrides: { routing } });
      expect(services.routing).toBe(routing);
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
    it("merges window.__MAPCAIRN_TEST_SERVICES__ over the real services", () => {
      const search = new FakeSearchProvider();
      const clipboard = new FakeClipboard();
      window.__MAPCAIRN_TEST_SERVICES__ = { search, clipboard };
      const info = vi
        .spyOn(console, "info")
        .mockImplementation(() => undefined);
      const services = createServices();
      expect(services.search).toBe(search);
      expect(services.clipboard).toBe(clipboard);
      expect(services.settings.get().units).toBe("metric");
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining("MAPCAIRN_TEST_SEAM_MARKER"),
      );
    });

    it("lets explicit overrides win over the seam", () => {
      const fromSeam = new FakeSearchProvider();
      const fromCode = new FakeSearchProvider();
      window.__MAPCAIRN_TEST_SERVICES__ = { search: fromSeam };
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      expect(createServices({ overrides: { search: fromCode } }).search).toBe(
        fromCode,
      );
    });

    it("lets a browser test replace the routing provider", () => {
      const routing = new FakeRoutingProvider();
      window.__MAPCAIRN_TEST_SERVICES__ = { routing };
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      expect(createServices().routing).toBe(routing);
    });

    it("lets a browser test replace the basemap catalogue", () => {
      window.__MAPCAIRN_TEST_SERVICES__ = {
        basemaps: BUILT_IN_BASEMAP_CATALOGUE,
      };
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      expect(createServices().basemaps).toBe(BUILT_IN_BASEMAP_CATALOGUE);
    });

    it("accepts a map adapter factory function", () => {
      const factory = vi.fn();
      window.__MAPCAIRN_TEST_SERVICES__ = { createMapAdapter: factory };
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
        window.__MAPCAIRN_TEST_SERVICES__ = malformed;
        expect(createServices().search.constructor).toBe(real);
      }
    });

    it("drops entries of the wrong kind and unknown keys, and keeps the good ones", () => {
      const clipboard = new FakeClipboard();
      window.__MAPCAIRN_TEST_SERVICES__ = {
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
      window.__MAPCAIRN_TEST_SERVICES__ = { search: "nope" };
      const info = vi.spyOn(console, "info");
      createServices();
      expect(info).not.toHaveBeenCalled();
    });

    it("is ignored in a production build", () => {
      vi.stubEnv("MODE", "production");
      const search = new FakeSearchProvider();
      window.__MAPCAIRN_TEST_SERVICES__ = { search };
      expect(createServices().search).not.toBe(search);
    });

    it("applies in the e2e and development modes", () => {
      for (const mode of ["e2e", "development"]) {
        vi.stubEnv("MODE", mode);
        const search = new FakeSearchProvider();
        window.__MAPCAIRN_TEST_SERVICES__ = { search };
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        expect(createServices().search).toBe(search);
      }
    });
  });
});
