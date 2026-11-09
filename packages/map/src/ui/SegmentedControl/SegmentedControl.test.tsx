import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

function Controlled({ initial = "light" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SegmentedControl
      label="Theme"
      options={options}
      value={value}
      onValueChange={setValue}
      data-testid="theme"
    />
  );
}

describe("SegmentedControl", () => {
  it("is a radio group named by its label", () => {
    render(<Controlled />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
  });

  it("checks exactly the item that matches the value", () => {
    render(<Controlled initial="dark" />);
    expect(
      screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("radio", { name: "System" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("selects an item when it is clicked", () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label="Theme"
        options={options}
        value="light"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onValueChange).toHaveBeenCalledWith("dark");
  });

  it("does not clear the selection when the active item is clicked again", () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label="Theme"
        options={options}
        value="light"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("shows a check mark on the selected item only", () => {
    render(<Controlled initial="light" />);
    expect(
      screen.getByRole("radio", { name: "Light" }).querySelector("svg"),
    ).not.toBeNull();
    expect(
      screen.getByRole("radio", { name: "Dark" }).querySelector("svg"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(
      screen.getByRole("radio", { name: "Dark" }).querySelector("svg"),
    ).not.toBeNull();
    expect(
      screen.getByRole("radio", { name: "Light" }).querySelector("svg"),
    ).toBeNull();
  });

  it("keeps the check mark out of the accessible name", () => {
    render(<Controlled initial="light" />);
    const selected = screen.getByRole("radio", { name: "Light" });
    expect(selected.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("renders an item icon when one is given, hidden from assistive technology", () => {
    render(
      <SegmentedControl
        label="Theme"
        options={[
          {
            value: "light",
            label: "Light",
            icon: <svg data-testid="sun" />,
          },
          { value: "dark", label: "Dark" },
        ]}
        value="dark"
        onValueChange={vi.fn()}
      />,
    );
    const icon = screen.getByTestId("sun");
    expect(icon.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("radio", { name: "Light" })).toBeTruthy();
  });

  it("is one tab stop that lands on the selected item, with roving focus on the arrow keys", async () => {
    render(<Controlled initial="light" />);
    const light = screen.getByRole("radio", { name: "Light" });
    const dark = screen.getByRole("radio", { name: "Dark" });
    const system = screen.getByRole("radio", { name: "System" });
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("tabindex")).toBe("0");
    expect(light.getAttribute("tabindex")).toBe("-1");
    expect(dark.getAttribute("tabindex")).toBe("-1");
    // Tabbing into the group lands on the selected item.
    group.focus();
    expect(document.activeElement).toBe(light);
    // Radix moves focus in a timeout after the key press.
    fireEvent.keyDown(light, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(dark));
    fireEvent.keyDown(dark, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(light));
    fireEvent.keyDown(light, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(system));
    fireEvent.keyDown(system, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(dark));
  });

  it("selects the focused item from the keyboard with Space or Enter", () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label="Theme"
        options={options}
        value="light"
        onValueChange={onValueChange}
      />,
    );
    const dark = screen.getByRole("radio", { name: "Dark" });
    dark.focus();
    // Radix items are native buttons, so Enter and Space arrive as clicks.
    fireEvent.click(dark);
    expect(onValueChange).toHaveBeenCalledWith("dark");
  });

  it("does not select a disabled control's items", () => {
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label="Theme"
        options={options}
        value="light"
        disabled
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeDisabled();
  });

  it("passes data-testid to the group and derives one per item", () => {
    render(<Controlled />);
    expect(screen.getByTestId("theme")).toBe(
      screen.getByRole("radiogroup", { name: "Theme" }),
    );
    expect(screen.getByTestId("theme-dark")).toBe(
      screen.getByRole("radio", { name: "Dark" }),
    );
  });

  it("adds no item test ids when the group has none", () => {
    render(
      <SegmentedControl
        label="Theme"
        options={options}
        value="light"
        onValueChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "Dark" }).hasAttribute("data-testid"),
    ).toBe(false);
  });

  it("merges an extra class name onto the group", () => {
    render(
      <SegmentedControl
        label="Theme"
        options={options}
        value="light"
        onValueChange={vi.fn()}
        className="extra"
      />,
    );
    expect(screen.getByRole("radiogroup").className).toContain("extra");
  });
});
