// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import { ServicesProvider } from "@mapcairn/map";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapRoute, { handle, links, meta } from "./map";

const SITE = "https://mapcairn.timothybrits.co.za";

describe("map route title", () => {
  it("names the catalogue key its tab title follows the language through", () => {
    expect(handle).toEqual({ titleKey: "host.title.map", brand: "first" });
  });
});

describe("map route links", () => {
  it("sets a canonical link to /map", () => {
    expect(links()).toContainEqual({ rel: "canonical", href: `${SITE}/map` });
  });

  it("preconnects to the default basemap's tile host, which only this page uses", () => {
    expect(links()).toContainEqual({
      rel: "preconnect",
      href: "https://tiles.openfreemap.org",
      crossOrigin: "anonymous",
    });
  });
});

describe("map route meta", () => {
  const tags = meta({} as never);

  it("describes the playground in its own title, description and Open Graph URL", () => {
    expect(tags).toContainEqual({ title: "MapCairn | Interactive map" });
    expect(tags).toContainEqual({
      name: "description",
      content: expect.stringContaining("MapCairn playground"),
    });
    expect(tags).toContainEqual({ property: "og:url", content: `${SITE}/map` });
  });
});

describe("map route server render", () => {
  // The root route supplies the services; the skeleton inside needs none.
  const services = createFakeServices();
  const html = renderToString(
    <ServicesProvider services={services}>
      <MapRoute />
    </ServicesProvider>,
  );

  it("asks for the skip link, the loading text and the description by key", () => {
    expect(services.fakes.messages.calls).toEqual(
      expect.arrayContaining([
        { key: "ui.skipToMap", params: {} },
        { key: "app.loadingMap", params: {} },
        { key: "host.map.summary", params: {} },
        { key: "host.about.product", params: {} },
      ]),
    );
  });

  it("starts with the skip link to the map region", () => {
    expect(html.startsWith('<a href="#map"')).toBe(true);
    expect(html).toContain(">Skip to map</a>");
  });

  it("has the hidden page heading and a map-coloured placeholder", () => {
    // The heading sits in a banner landmark, so no page content is outside a
    // landmark (axe best-practice rule "region").
    expect(html).toMatch(/<header><h1 class="[^"]+">MapCairn<\/h1>/);
    expect(html).toMatch(/<main class="[^"]+" aria-busy="true"/);
    expect(html).toContain('data-testid="map-placeholder"');
  });

  it("says in the server's HTML what the playground is, for readers that do not run the app", () => {
    const header = html.slice(
      html.indexOf("<header>"),
      html.indexOf("</header>"),
    );
    expect(header).toContain(
      "The MapCairn playground is an interactive map built with the MapCairn SDK.",
    );
  });

  it("links the product page, the source and the privacy policy when scripts do not run", () => {
    const noscript = html.slice(
      html.indexOf("<noscript>"),
      html.indexOf("</noscript>"),
    );
    expect(noscript).toContain(
      '<a href="/">About MapCairn, the SDK behind this map</a>',
    );
    expect(noscript).toContain(
      '<a href="https://github.com/MapCairn/mapcairn">View the source code and licence on GitHub</a>',
    );
    expect(noscript).toContain(
      '<a href="/privacy">Read the privacy policy</a>',
    );
  });

  it("gives the skip link a target before the app mounts", () => {
    expect(html).toMatch(/<main[^>]* id="map"/);
  });

  it("renders no map, no settings sheet and no style attribute", () => {
    expect(html).not.toContain("data-map-host");
    expect(html).not.toContain("map-options-sheet");
    expect(html).not.toContain("sheet-section-settings");
    expect(html).not.toMatch(/style=/);
  });

  it("draws the chrome as a decorative skeleton inside the busy main landmark", () => {
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(main).toContain(">Loading the map<");
    const skeleton = main.slice(main.indexOf('data-testid="chrome-skeleton"'));
    expect(skeleton).toContain('aria-hidden="true"');
    expect(skeleton).toMatch(/\sinert(=""|\s|>)/);
    for (const control of [
      "Search places",
      "Map options",
      "Measure distance and area",
      "Locate me",
      "Settings",
      "Zoom in",
      "Zoom out",
      "Map credits",
    ]) {
      expect(skeleton).toContain(control);
    }
  });
});
