import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeRoute, { links } from "./home";

describe("home route links", () => {
  it("sets a canonical link to the site root", () => {
    expect(links()).toContainEqual({
      rel: "canonical",
      href: "https://karta.timothybrits.co.za",
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
    expect(html).toMatch(/<h1 class="[^"]+">Karta<\/h1>/);
    expect(html).toMatch(/<main class="[^"]+" aria-busy="true"/);
    expect(html).toContain('data-testid="map-placeholder"');
  });

  it("renders no map, no settings and no style attribute", () => {
    expect(html).not.toContain('data-engine="');
    expect(html).not.toContain("Map options");
    expect(html).not.toMatch(/style=/);
  });
});
