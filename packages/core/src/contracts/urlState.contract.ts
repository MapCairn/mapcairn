// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { UrlState } from "../ports/url";
import { serialiseUrlHash } from "../urlHash/urlHash";

/** What the url contract needs besides the port itself. */
export interface UrlStateControls {
  /**
   * Waits until pending writes have reached the address. A real adapter
   * debounces writes, so it flushes here; a fake does nothing.
   */
  settle(): Promise<void>;
}

/** One url state under test, with its controls. */
export interface UrlStateSubject {
  /** A url state over an address with no shareable state. */
  readonly url: UrlState;
  readonly controls: UrlStateControls;
}

const VIEW = {
  center: { lat: -33.9249, lng: 18.4241 },
  zoom: 12,
  bearing: 0,
};

/**
 * Runs the shared behavioural suite for a {@link UrlState}. Every test calls
 * `create` for a fresh subject. Positions are compared to two decimals
 * because a real adapter may round what it puts in the address.
 */
export function runUrlStateContract(
  name: string,
  create: () => UrlStateSubject,
): void {
  describe(`UrlState contract: ${name}`, () => {
    it("reads an empty value when the address holds no state", () => {
      const { url } = create();
      expect(url.read()).toEqual({});
    });

    it("reads back a basemap id it wrote", async () => {
      const { url, controls } = create();
      url.write({ basemapId: "positron" });
      await controls.settle();
      expect(url.read().basemapId).toBe("positron");
    });

    it("reads back a view it wrote", async () => {
      const { url, controls } = create();
      url.write({ view: VIEW, basemapId: "liberty" });
      await controls.settle();
      const value = url.read();
      expect(value.basemapId).toBe("liberty");
      expect(value.view?.center.lat).toBeCloseTo(VIEW.center.lat, 2);
      expect(value.view?.center.lng).toBeCloseTo(VIEW.center.lng, 2);
      expect(value.view?.zoom).toBeCloseTo(VIEW.zoom, 2);
      expect(value.view?.bearing).toBeCloseTo(VIEW.bearing, 2);
    });

    it("replaces the previous value instead of merging", async () => {
      const { url, controls } = create();
      url.write({ view: VIEW, basemapId: "liberty" });
      await controls.settle();
      url.write({ basemapId: "dark" });
      await controls.settle();
      expect(url.read().basemapId).toBe("dark");
      expect(url.read().view).toBeUndefined();
    });

    it("clears the state when an empty value is written", async () => {
      const { url, controls } = create();
      url.write({ view: VIEW, basemapId: "liberty" });
      await controls.settle();
      url.write({});
      await controls.settle();
      expect(url.read()).toEqual({});
    });

    it("builds a link that ends in the hash of a value, without writing it", async () => {
      const { url, controls } = create();
      url.write({ basemapId: "positron" });
      await controls.settle();
      const link = url.link({ view: VIEW, shapes: "pAAAA" });
      expect(link).toBe(
        `${link.slice(0, link.indexOf("#"))}${serialiseUrlHash({ view: VIEW, shapes: "pAAAA" })}`,
      );
      expect(link).toContain("#map=12.00/-33.92490/18.42410");
      expect(link).toContain("&shapes=pAAAA");
      await controls.settle();
      expect(url.read()).toEqual({ basemapId: "positron" });
    });

    it("reads shapes back from a hash that carries them", async () => {
      const { url, controls } = create();
      url.write({ basemapId: "positron", shapes: "pAAAA" });
      await controls.settle();
      expect(url.read().shapes).toBe("pAAAA");
    });

    it("builds a link with no hash for an empty value", () => {
      const { url } = create();
      expect(url.link({})).not.toContain("#");
    });

    it("keeps the last of several rapid writes", async () => {
      const { url, controls } = create();
      url.write({ basemapId: "a" });
      url.write({ basemapId: "b" });
      url.write({ basemapId: "c" });
      await controls.settle();
      expect(url.read().basemapId).toBe("c");
    });
  });
}
