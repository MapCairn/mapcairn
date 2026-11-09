import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "../constants/themeConfig";
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

    expect(screen.getByText(THEME_STORAGE_KEY)).toBeInTheDocument();
    expect(screen.getByText("karta:")).toBeInTheDocument();
  });

  it("discloses Cloudflare Web Analytics as cookieless and aggregate-only", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Cloudflare Web Analytics/)).toBeInTheDocument();
    expect(screen.getByText(/cookieless/)).toBeInTheDocument();
  });

  it("discloses the basemap tile and location-search third parties", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument();
    expect(screen.getByText(/Esri/)).toBeInTheDocument();
    expect(screen.getByText(/Nominatim/)).toBeInTheDocument();
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
