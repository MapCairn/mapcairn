import { FAKE_CREDITED_BASEMAP } from "@karta/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermanentCredit } from "./PermanentCredit";

const credit = (() => {
  const value = FAKE_CREDITED_BASEMAP.credit;
  if (value === undefined) {
    throw new Error("The fixture has no credit.");
  }
  return value;
})();

describe("PermanentCredit", () => {
  it("is a region named for the basemap's credit, always in the page", () => {
    render(<PermanentCredit credit={credit} />);
    const group = screen.getByRole("region", { name: "Basemap credit" });
    expect(group).toBe(screen.getByTestId("permanent-credit"));
    expect(group).toBeVisible();
  });

  it("draws the logo as an image named by its label, at the provider's least height", () => {
    render(<PermanentCredit credit={credit} />);
    const logo = screen.getByRole("img", { name: "Fake provider" });
    expect(logo.getAttribute("src")).toBe("/basemaps/fake-provider.svg");
    expect(logo.getAttribute("height")).toBe("24");
    expect(logo.hasAttribute("style")).toBe(false);
  });

  it("links the logo to the provider, in a new tab, without sending the page's address", () => {
    render(<PermanentCredit credit={credit} />);
    const link = screen.getByRole("link", { name: /^Fake provider/ });
    expect(link).toHaveAttribute("href", "https://provider.example/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(within(link).getByText(/opens in a new tab/i)).toBeInTheDocument();
  });

  it("shows each credit line, linked where the provider gives a link", () => {
    render(
      <PermanentCredit
        credit={{
          ...credit,
          lines: [
            { text: "© One", href: "https://one.example/" },
            { text: "© Two" },
          ],
        }}
      />,
    );
    const group = screen.getByTestId("permanent-credit");
    const one = within(group).getByRole("link", { name: /^© One/ });
    expect(one).toHaveAttribute("href", "https://one.example/");
    expect(one).toHaveAttribute("target", "_blank");
    expect(within(group).getByText("© Two")).toBeVisible();
    expect(within(group).queryByRole("link", { name: /© Two/ })).toBeNull();
  });

  it("has nothing to expand or close, and takes no focus by itself", () => {
    render(<PermanentCredit credit={credit} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("draws the logo at the height the credit asks for", () => {
    render(
      <PermanentCredit
        credit={{ ...credit, logo: { ...credit.logo, minHeight: 32 } }}
      />,
    );
    expect(
      screen.getByRole("img", { name: "Fake provider" }).getAttribute("height"),
    ).toBe("32");
  });

  it("draws no empty chip when the credit has no lines, and still has its logo link", () => {
    const { container } = render(
      <PermanentCredit credit={{ ...credit, lines: [] }} />,
    );
    expect(container.querySelector("p")).toBeNull();
    expect(
      within(screen.getByTestId("permanent-credit")).getAllByRole("link"),
    ).toHaveLength(1);
  });

  it("draws every line when a provider repeats one, without warning about keys", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PermanentCredit
        credit={{
          ...credit,
          lines: [
            { text: "© Same", href: "https://provider.example/a" },
            { text: "© Same", href: "https://provider.example/b" },
            { text: "© Same" },
            { text: "© Same" },
          ],
        }}
      />,
    );
    expect(screen.getAllByText("© Same", { exact: false })).toHaveLength(4);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
