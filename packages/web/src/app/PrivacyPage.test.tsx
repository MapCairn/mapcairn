import { THEME_STORAGE_KEY } from "@karta/core";
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

    expect(THEME_STORAGE_KEY).toBe("karta:theme");
    expect(screen.getByText("karta:theme")).toBeInTheDocument();
    expect(screen.queryByText("buffer-zones-theme")).not.toBeInTheDocument();
    expect(screen.getByText("karta:")).toBeInTheDocument();
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
