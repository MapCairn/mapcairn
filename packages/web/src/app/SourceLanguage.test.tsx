// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceLanguage } from "./SourceLanguage";

describe("SourceLanguage", () => {
  it("marks its text as British English", () => {
    render(<SourceLanguage>Nothing is sent until you ask.</SourceLanguage>);
    expect(screen.getByText("Nothing is sent until you ask.")).toHaveAttribute(
      "lang",
      "en-GB",
    );
  });
});
