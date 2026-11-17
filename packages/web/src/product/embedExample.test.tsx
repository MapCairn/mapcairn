// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./embedExample";

describe("the embedding example the product page shows", () => {
  it("renders a working map region on the SDK's fakes", () => {
    render(<App />);
    expect(screen.getByRole("region", { name: "Map" })).toBeInTheDocument();
    expect(screen.getByTestId("live-region-polite")).toBeInTheDocument();
  });
});
