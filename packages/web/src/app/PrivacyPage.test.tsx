import { THEME_STORAGE_KEY } from "@mapcairn/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRIVACY_POLICY_TITLE, PrivacyPage } from "./PrivacyPage";

describe("PrivacyPage", () => {
  it("renders the page heading in a main landmark", () => {
    render(<PrivacyPage />);

    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        name: PRIVACY_POLICY_TITLE,
        level: 1,
      }),
    ).toBeInTheDocument();
  });

  it("states that the site sets no cookies", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/sets no cookies/)).toBeInTheDocument();
  });

  it("names the local storage keys it really uses", () => {
    render(<PrivacyPage />);

    expect(THEME_STORAGE_KEY).toBe("mapcairn:theme");
    expect(screen.getByText("mapcairn:theme")).toBeInTheDocument();
    expect(screen.queryByText("buffer-zones-theme")).not.toBeInTheDocument();
    expect(screen.getByText("mapcairn:")).toBeInTheDocument();
  });

  it("gives a contact address for privacy questions", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("link", { name: "mapcairn@timothybrits.co.za" }),
    ).toHaveAttribute("href", "mailto:mapcairn@timothybrits.co.za");
  });

  it("discloses Cloudflare Web Analytics as cookieless and aggregate-only", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Cloudflare Web Analytics/)).toBeInTheDocument();
    expect(screen.getByText(/cookieless/)).toBeInTheDocument();
  });

  it("discloses the basemap tile and location-search third parties", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/OpenFreeMap/)).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap Foundation/)).toBeInTheDocument();
    expect(screen.getByText(/OpenTopoMap/)).toBeInTheDocument();
    expect(
      screen.getByText(/OpenStreetMap's Nominatim geocoding service/),
    ).toBeInTheDocument();
  });

  it("says the device location is used only on request and is not sent", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "Your location", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/only when you press it/)).toBeInTheDocument();
  });

  it("discloses client-side error reports as containing no personal data", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/diagnostic report/)).toBeInTheDocument();
    expect(
      screen.getByText(/Cloudflare's operational logs/),
    ).toBeInTheDocument();
  });

  it("lists exactly what an error report carries, and that it never carries your position", () => {
    render(<PrivacyPage />);

    const text = screen.getByText(/diagnostic report/).textContent ?? "";
    expect(text).toMatch(
      /error message, a stack trace, the page's address without its query or the part after #/,
    );
    expect(text).toMatch(
      /whether it was an uncaught error or a rejected promise/,
    );
    expect(text).toMatch(/never includes the map's position or yours/);
    expect(text).not.toMatch(/page URL/);
  });

  it("says search sends the query only when you search, not as you type", () => {
    render(<PrivacyPage />);

    const text = screen.getByText(/Nominatim geocoding service/).textContent;
    expect(text).toMatch(/When you search/);
    expect(text).not.toMatch(/Typing/);
  });

  it("names every data layer provider and says nothing is sent until a layer is on", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "Data layers", level: 2 }),
    ).toBeInTheDocument();
    const text = screen.getByText(/Every data layer is off/).textContent;
    expect(text).toMatch(/nothing is requested before\s+that/);
    for (const provider of ["USGS", "NASA", "GDACS", "Copernicus"]) {
      expect(text).toContain(provider);
    }
    expect(text).toMatch(/IP address/);
  });

  it("discloses that Look up address sends the pin's rounded position, only when pressed", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { name: "Pin addresses", level: 2 }),
    ).toBeInTheDocument();
    const text = screen.getByText(/Look up address/).textContent;
    expect(text).toMatch(/only when you press/);
    expect(text).toMatch(/about 11 m/);
    expect(text).toMatch(/Nominatim/);
  });

  it("names the routing service and says what a route or area request sends, and when", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", {
        name: "Routes and travel-time areas",
        level: 2,
      }),
    ).toBeInTheDocument();
    const text = screen.getByText(/Valhalla routing service/).textContent ?? "";
    expect(text).toContain("valhalla1.openstreetmap.de");
    expect(text).toContain("FOSSGIS");
    expect(text).toContain("OpenStreetMap");
    expect(text).toMatch(/coordinates/);
    expect(text).toMatch(/travel mode/);
    expect(text).toMatch(/IP address/);
    expect(text).toMatch(/Nothing is sent before you ask/);
    expect(text).toMatch(/not saved or put in the page address/);
  });

  it("names the basemap tile providers that may log requests: OpenFreeMap, the OpenStreetMap Foundation for Streets, and OpenTopoMap for Topographic", () => {
    render(<PrivacyPage />);

    const text = screen.getByText(/The basemap tile providers/).textContent;
    expect(text).toMatch(
      /OpenFreeMap, the OpenStreetMap Foundation when you choose the Streets basemap, and OpenTopoMap when you choose the Topographic basemap, may log tile requests, including your IP address/,
    );
  });

  it("does not mention VersaTiles, which the site no longer loads from", () => {
    const { container } = render(<PrivacyPage />);

    expect(container.textContent).not.toMatch(/VersaTiles/);
  });

  it("has no section or link for Maptoolkit or Mapterhorn, which the site no longer loads from", () => {
    const { container } = render(<PrivacyPage />);

    expect(container.textContent).not.toMatch(/Maptoolkit|Mapterhorn/);
  });

  it("links to the host's policy in a new tab, announced to screen readers", () => {
    render(<PrivacyPage />);

    const link = screen.getByRole("link", {
      name: /Cloudflare's own privacy policy/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://www.cloudflare.com/privacypolicy/",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName(/opens in a new tab/);
  });

  it("links back to the map", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("link", { name: "Back to the map" }),
    ).toHaveAttribute("href", "/");
  });
});
