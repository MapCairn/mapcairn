import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextHeadingLevel, Section, Subheading } from "./Section";

describe("Section", () => {
  it("is a region named by an h3 by default", () => {
    render(
      <Section title="Pin">
        <p>Body</p>
      </Section>,
    );
    const heading = screen.getByRole("heading", { name: "Pin", level: 3 });
    const region = screen.getByRole("region", { name: "Pin" });
    expect(region.contains(heading)).toBe(true);
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("uses the heading level it is given", () => {
    render(<Section title="Pin" headingLevel={4} />);
    expect(screen.getByRole("heading", { level: 4 })).toBeInTheDocument();
  });

  it("makes the heading focusable from script but not from the keyboard", () => {
    render(<Section title="Pin" />);
    expect(screen.getByRole("heading").getAttribute("tabindex")).toBe("-1");
  });

  it("hands the heading element to headingRef", () => {
    let element: HTMLHeadingElement | null = null;
    render(
      <Section
        title="Pin"
        headingRef={(node) => {
          element = node;
        }}
      />,
    );
    expect(element).toBe(screen.getByRole("heading"));
  });

  it("passes the test id and a class name to the section", () => {
    render(<Section title="Pin" className="extra" data-testid="pin" />);
    const region = screen.getByTestId("pin");
    expect(region.tagName).toBe("SECTION");
    expect(region.className).toContain("extra");
  });
});

describe("Subheading", () => {
  it("renders a heading at the given level", () => {
    render(<Subheading level={5}>Privacy</Subheading>);
    expect(
      screen.getByRole("heading", { name: "Privacy", level: 5 }),
    ).toBeInTheDocument();
  });
});

describe("nextHeadingLevel", () => {
  it("goes one level down and stops at 6", () => {
    expect(nextHeadingLevel(3)).toBe(4);
    expect(nextHeadingLevel(5)).toBe(6);
    expect(nextHeadingLevel(6)).toBe(6);
  });
});
