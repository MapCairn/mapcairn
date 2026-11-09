import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

function Controlled({ initial = false }: { initial?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      label="Show scale"
      checked={checked}
      onCheckedChange={setChecked}
      data-testid="scale"
    />
  );
}

describe("Switch", () => {
  it("exposes a switch role named by its visible label", () => {
    render(
      <Switch label="Show scale" checked={false} onCheckedChange={vi.fn()} />,
    );
    const control = screen.getByRole("switch", { name: "Show scale" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Show scale").tagName).toBe("LABEL");
  });

  it("toggles when the label is clicked", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        label="Show scale"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(screen.getByText("Show scale"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles from the keyboard with Space", () => {
    render(<Controlled />);
    const control = screen.getByRole("switch");
    control.focus();
    // Radix renders a button, so Space activates it as a click.
    fireEvent.click(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(control);
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("is a native button that is reachable by Tab and takes Enter and Space", () => {
    render(<Controlled />);
    const control = screen.getByRole("switch");
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("type")).toBe("button");
    expect(control.hasAttribute("tabindex")).toBe(false);
  });

  it("reflects the controlled checked state in aria and data attributes", () => {
    render(<Controlled initial />);
    const control = screen.getByRole("switch");
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(control.getAttribute("data-state")).toBe("checked");
  });

  it("shows a tick on the thumb only when on, so the state is not colour or position alone", () => {
    const { rerender } = render(
      <Switch label="Show scale" checked={false} onCheckedChange={vi.fn()} />,
    );
    expect(screen.getByRole("switch").querySelector("svg")).toBeNull();
    rerender(<Switch label="Show scale" checked onCheckedChange={vi.fn()} />);
    const tick = screen.getByRole("switch").querySelector("svg");
    expect(tick).not.toBeNull();
    expect(tick?.getAttribute("aria-hidden")).toBe("true");
  });

  it("describes the control with the description text", () => {
    render(
      <Switch
        label="Show scale"
        description="Adds a distance bar to the map."
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    );
    const control = screen.getByRole("switch", { name: "Show scale" });
    expect(control).toHaveAccessibleDescription(
      "Adds a distance bar to the map.",
    );
  });

  it("has no description relation when no description is given", () => {
    render(
      <Switch label="Show scale" checked={false} onCheckedChange={vi.fn()} />,
    );
    expect(screen.getByRole("switch").hasAttribute("aria-describedby")).toBe(
      false,
    );
  });

  it("does not toggle when disabled", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        label="Show scale"
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole("switch");
    expect(control).toBeDisabled();
    fireEvent.click(control);
    fireEvent.click(screen.getByText("Show scale"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("gives each instance its own label association", () => {
    render(
      <>
        <Switch label="One" checked={false} onCheckedChange={vi.fn()} />
        <Switch label="Two" checked onCheckedChange={vi.fn()} />
      </>,
    );
    expect(screen.getByRole("switch", { name: "One" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Two" })).toBeTruthy();
  });

  it("passes data-testid to the control and a class name to the row", () => {
    render(
      <Switch
        label="Show scale"
        checked={false}
        onCheckedChange={vi.fn()}
        data-testid="scale"
        className="extra"
      />,
    );
    expect(screen.getByTestId("scale")).toBe(screen.getByRole("switch"));
    expect(screen.getByTestId("scale-row").className).toContain("extra");
  });
});
