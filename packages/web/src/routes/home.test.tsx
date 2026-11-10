import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeRoute, { links } from "./home";

describe("home route links", () => {
  it("sets a canonical link to the site root", () => {
    expect(links()).toContainEqual({
      rel: "canonical",
      href: "https://mapcairn.timothybrits.co.za",
    });
  });
});

describe("home route server render", () => {
  // No services provider: the static shell must not need one.
  const html = renderToString(<HomeRoute />);

  it("starts with the skip link to the map region", () => {
    expect(html.startsWith('<a href="#map"')).toBe(true);
    expect(html).toContain(">Skip to map</a>");
  });

  it("has the hidden page heading and a map-coloured placeholder", () => {
    expect(html).toMatch(/<h1 class="[^"]+">MapCairn<\/h1>/);
    // The heading sits in a banner landmark, so no page content is outside a
    // landmark (axe best-practice rule "region").
    expect(html).toMatch(/<header><h1 class="[^"]+">MapCairn<\/h1><\/header>/);
    expect(html).toMatch(/<main class="[^"]+" aria-busy="true"/);
    expect(html).toContain('data-testid="map-placeholder"');
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
