// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./embedExample";

describe("the embedding example the product page shows", () => {
  it("renders the map region with the search box over it, on the SDK's fakes", async () => {
    render(<App />);
    expect(screen.getByRole("region", { name: "Map" })).toBeInTheDocument();
    expect(await screen.findByRole("search")).toBeInTheDocument();
    expect(screen.getByTestId("live-region-polite")).toBeInTheDocument();
  });
});
