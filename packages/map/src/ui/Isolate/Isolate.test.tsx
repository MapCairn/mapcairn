// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Isolate } from "./Isolate";

describe("Isolate", () => {
  it("wraps text in a bdi, which isolates it and takes its direction from its first strong letter", () => {
    render(<Isolate>Zürich</Isolate>);
    const element = screen.getByText("Zürich");
    expect(element.tagName).toBe("BDI");
    expect(element.getAttribute("dir")).toBeNull();
  });

  it("names the language of text that is not in the surrounding language", () => {
    render(<Isolate lang="ar">القاهرة</Isolate>);
    expect(screen.getByText("القاهرة").getAttribute("lang")).toBe("ar");
  });

  it("forces left to right for ASCII figures such as coordinates, and keeps them out of machine translation", () => {
    render(<Isolate figure>-26.20410, 28.04730</Isolate>);
    const element = screen.getByText("-26.20410, 28.04730");
    expect(element.tagName).toBe("BDI");
    expect(element.getAttribute("dir")).toBe("ltr");
    expect(element.getAttribute("translate")).toBe("no");
  });

  it("passes other attributes through", () => {
    render(<Isolate data-testid="name">Pretoria</Isolate>);
    expect(screen.getByTestId("name").textContent).toBe("Pretoria");
  });
});
