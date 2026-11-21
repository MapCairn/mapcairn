// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { RELEASE } from "../product/releaseFacts.server";
import ProductRoute, { handle, loader } from "./product";

/** The route at `/` with its own loader, as React Router runs it. */
function renderRoute() {
  const Stub = createRoutesStub([
    { path: "/", Component: ProductRoute, loader },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("product route", () => {
  it("renders the product page, with no map in it", async () => {
    const { container } = renderRoute();
    expect(await screen.findByTestId("product-page")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("map-placeholder");
    expect(container.innerHTML).not.toContain("data-map-host");
  });

  it("names the latest release the loader read from the changelog", async () => {
    expect(loader()).toEqual(RELEASE);
    renderRoute();
    expect(await screen.findByTestId("hero-release")).toHaveTextContent(
      `The latest release is ${RELEASE.version}`,
    );
  });

  it("keeps the document in English, whatever the playground speaks", () => {
    expect(handle).toMatchObject({ language: "en-GB" });
  });

  it("asks for its script preloads to follow the content, so the stylesheets and font paint first", () => {
    expect(handle).toMatchObject({ modulePreload: "end" });
  });
});
