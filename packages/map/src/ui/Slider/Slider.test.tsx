import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Slider } from "./Slider";

beforeAll(() => {
  // Radix Slider measures its control with ResizeObserver and uses pointer capture.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  for (const name of [
    "hasPointerCapture",
    "setPointerCapture",
    "releasePointerCapture",
  ]) {
    if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, {
        value: () => false,
        configurable: true,
      });
    }
  }
});

const percent = (value: number) => `${value}%`;

function Controlled({ initial = 50 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <Slider
      label="Opacity"
      min={0}
      max={100}
      step={10}
      value={value}
      onValueChange={setValue}
      formatValue={percent}
      data-testid="opacity"
    />
  );
}

describe("Slider", () => {
  it("exposes a slider role with name, range and value text", () => {
    render(<Controlled />);
    const thumb = screen.getByRole("slider", { name: "Opacity" });
    expect(thumb.getAttribute("aria-valuemin")).toBe("0");
    expect(thumb.getAttribute("aria-valuemax")).toBe("100");
    expect(thumb.getAttribute("aria-valuenow")).toBe("50");
    expect(thumb.getAttribute("aria-valuetext")).toBe("50%");
  });

  it("shows the formatted value as visible text", () => {
    render(<Controlled initial={30} />);
    expect(screen.getByTestId("opacity-value").textContent).toBe("30%");
    expect(screen.getByText("Opacity")).toBeTruthy();
  });

  it("is focusable by Tab", () => {
    render(<Controlled />);
    expect(screen.getByRole("slider").getAttribute("tabindex")).toBe("0");
  });

  it("changes by one step with the arrow keys and updates the readout", () => {
    render(<Controlled />);
    const thumb = screen.getByRole("slider");
    thumb.focus();
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("60");
    expect(thumb.getAttribute("aria-valuetext")).toBe("60%");
    expect(screen.getByTestId("opacity-value").textContent).toBe("60%");
    fireEvent.keyDown(thumb, { key: "ArrowLeft" });
    fireEvent.keyDown(thumb, { key: "ArrowDown" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("40");
    fireEvent.keyDown(thumb, { key: "ArrowUp" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("50");
  });

  it("jumps to the ends with Home and End", () => {
    render(<Controlled />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "Home" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.keyDown(thumb, { key: "End" });
    expect(thumb.getAttribute("aria-valuenow")).toBe("100");
  });

  it("takes larger steps with PageUp and PageDown", () => {
    render(<Controlled />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "PageDown" });
    expect(Number(thumb.getAttribute("aria-valuenow"))).toBeLessThan(40);
    fireEvent.keyDown(thumb, { key: "PageUp" });
    fireEvent.keyDown(thumb, { key: "PageUp" });
    expect(Number(thumb.getAttribute("aria-valuenow"))).toBeGreaterThan(60);
  });

  it("reports a plain number, not an array, through onValueChange", () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        label="Opacity"
        min={0}
        max={100}
        step={5}
        value={20}
        onValueChange={onValueChange}
        formatValue={percent}
      />,
    );
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenCalledWith(25);
  });

  it("stays controlled: the thumb follows the value prop", () => {
    const props = {
      label: "Opacity",
      min: 0,
      max: 100,
      step: 1,
      onValueChange: vi.fn(),
      formatValue: percent,
    };
    const { rerender } = render(<Slider {...props} value={10} />);
    rerender(<Slider {...props} value={80} />);
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("80");
  });

  it("does not change when disabled", () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        label="Opacity"
        min={0}
        max={100}
        step={1}
        value={10}
        disabled
        onValueChange={onValueChange}
        formatValue={percent}
      />,
    );
    const thumb = screen.getByRole("slider");
    expect(thumb.hasAttribute("tabindex")).toBe(false);
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("sets the fill from the value as a percentage of the range", () => {
    render(
      <Slider
        label="Zoom"
        min={10}
        max={20}
        step={1}
        value={15}
        onValueChange={vi.fn()}
        formatValue={String}
        data-testid="zoom"
      />,
    );
    expect(
      screen.getByTestId("zoom-track").style.getPropertyValue("--slider-fill"),
    ).toBe("50%");
  });

  it("keeps the fill inside the range when the value is out of bounds", () => {
    render(
      <Slider
        label="Zoom"
        min={0}
        max={10}
        step={1}
        value={25}
        onValueChange={vi.fn()}
        formatValue={String}
        data-testid="zoom"
      />,
    );
    expect(
      screen.getByTestId("zoom-track").style.getPropertyValue("--slider-fill"),
    ).toBe("100%");
  });

  it("shows an empty fill for a degenerate range", () => {
    render(
      <Slider
        label="Zoom"
        min={5}
        max={5}
        step={1}
        value={5}
        onValueChange={vi.fn()}
        formatValue={String}
        data-testid="zoom"
      />,
    );
    expect(
      screen.getByTestId("zoom-track").style.getPropertyValue("--slider-fill"),
    ).toBe("0%");
  });

  it("passes data-testid to the wrapper and a class name through", () => {
    render(
      <Slider
        label="Opacity"
        min={0}
        max={1}
        step={0.1}
        value={0.5}
        onValueChange={vi.fn()}
        formatValue={String}
        data-testid="opacity"
        className="extra"
      />,
    );
    const wrapper = screen.getByTestId("opacity");
    expect(wrapper.className).toContain("extra");
    expect(wrapper.contains(screen.getByRole("slider"))).toBe(true);
  });
});
