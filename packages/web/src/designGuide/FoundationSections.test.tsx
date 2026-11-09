import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pairSummary, Verdict } from "./FoundationSections";
import { contrastRows } from "./guideData";

describe("Verdict", () => {
  it("says Pass in words for a ratio that meets its minimum", () => {
    render(<Verdict result={{ ratio: 7.5, passes: true }} />);
    expect(screen.getByText("7.50:1")).toBeInTheDocument();
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("says Fail in words for a ratio below its minimum, not by colour alone", () => {
    render(<Verdict result={{ ratio: 2.9, passes: false }} />);
    expect(screen.getByText("2.90:1")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });
});

describe("pairSummary", () => {
  const [row] = contrastRows();

  it("gives both ratios, the minimum and a pass", () => {
    if (!row) {
      throw new Error("no contrast rows");
    }
    expect(pairSummary(row)).toMatch(
      /^Text on surface: [\d.]+:1 light, [\d.]+:1 dark, needs 4\.5:1, pass$/,
    );
  });

  it("says fail when either theme fails", () => {
    if (!row) {
      throw new Error("no contrast rows");
    }
    expect(pairSummary({ ...row, dark: { ratio: 3, passes: false } })).toMatch(
      /, fail$/,
    );
  });
});
