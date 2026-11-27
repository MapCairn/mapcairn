// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const options = [
  { value: "walk", label: "Walk" },
  { value: "cycle", label: "Cycle" },
  { value: "drive", label: "Drive" },
] as const;

const radio = (name: string) => screen.getByRole("radio", { name });
const group = () => screen.getByRole("radiogroup", { name: "Travel" });

function renderTravel(
  props: { value?: string; disabled?: boolean } = {},
  onValueChange = vi.fn(),
) {
  const view = render(
    <>
      <SegmentedControl
        label="Travel"
        options={options}
        value={props.value ?? "cycle"}
        disabled={props.disabled}
        onValueChange={onValueChange}
      />
      <button type="button">After</button>
    </>,
  );
  return { ...view, onValueChange };
}

/** Presses a key and lets a deferred focus move happen. Returns whether the default stayed. */
function press(
  target: Element,
  key: string,
  modifiers: KeyboardEventInit = {},
): boolean {
  let kept = true;
  act(() => {
    kept = fireEvent.keyDown(target, { key, ...modifiers });
    vi.advanceTimersByTime(0);
  });
  return kept;
}

const focus = (element: HTMLElement) => act(() => element.focus());

describe("SegmentedControl keyboard model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["ArrowRight", "Drive"],
    ["ArrowDown", "Drive"],
    ["ArrowLeft", "Walk"],
    ["ArrowUp", "Walk"],
    ["Home", "Walk"],
    ["PageUp", "Walk"],
    ["End", "Drive"],
    ["PageDown", "Drive"],
  ])(
    "moves focus on %s without choosing, and keeps the page still",
    (key, to) => {
      const { onValueChange } = renderTravel();
      focus(radio("Cycle"));

      expect(press(radio("Cycle"), key)).toBe(false);

      expect(document.activeElement).toBe(radio(to));
      expect(onValueChange).not.toHaveBeenCalled();
      expect(radio("Cycle").getAttribute("aria-checked")).toBe("true");
    },
  );

  it.each([["altKey"], ["ctrlKey"], ["metaKey"], ["shiftKey"]])(
    "leaves an arrow held with %s to the browser",
    (modifier) => {
      renderTravel();
      focus(radio("Cycle"));

      expect(press(radio("Cycle"), "ArrowRight", { [modifier]: true })).toBe(
        true,
      );

      expect(document.activeElement).toBe(radio("Cycle"));
    },
  );

  it("leaves other keys to the browser", () => {
    renderTravel();
    focus(radio("Cycle"));

    expect(press(radio("Cycle"), "a")).toBe(true);
    expect(press(radio("Cycle"), " ")).toBe(true);
    expect(press(radio("Cycle"), "Enter")).toBe(true);
    expect(press(radio("Cycle"), "Tab")).toBe(true);
  });

  it("gives the tab stop to the item that has focus", () => {
    renderTravel();
    const stops = () =>
      screen.getAllByRole("radio").map((item) => item.getAttribute("tabindex"));
    expect(stops()).toEqual(["-1", "-1", "-1"]);

    focus(radio("Walk"));

    expect(stops()).toEqual(["0", "-1", "-1"]);
    focus(screen.getByRole("button", { name: "After" }));
    expect(stops()).toEqual(["0", "-1", "-1"]);
    expect(group().getAttribute("tabindex")).toBe("0");
  });

  it("gives the tab stop to an item on mouse down, which Safari does not focus", () => {
    renderTravel();

    fireEvent.mouseDown(radio("Drive"));

    expect(radio("Drive").getAttribute("tabindex")).toBe("0");
  });

  it("goes in on the chosen item, not the one that had focus last", () => {
    renderTravel();
    focus(radio("Walk"));
    focus(screen.getByRole("button", { name: "After" }));

    focus(group());

    expect(document.activeElement).toBe(radio("Cycle"));
  });

  it("goes in on the first item when nothing matches the value", () => {
    renderTravel({ value: "fly" });

    focus(group());

    expect(document.activeElement).toBe(radio("Walk"));
  });

  it("does not move focus when a pointer focuses the group itself", () => {
    renderTravel();

    fireEvent.mouseDown(group());
    focus(group());

    expect(document.activeElement).toBe(group());
  });

  it("takes the group out of the tab order while Shift+Tab leaves it, and puts it back", () => {
    renderTravel();
    focus(radio("Cycle"));

    expect(press(radio("Cycle"), "Tab", { shiftKey: true })).toBe(true);

    expect(group().getAttribute("tabindex")).toBe("-1");
    focus(screen.getByRole("button", { name: "After" }));
    expect(group().getAttribute("tabindex")).toBe("0");
  });

  it("marks the chosen item on and the rest off, for styles and focus", () => {
    renderTravel();
    expect(
      screen.getAllByRole("radio").map((item) => item.dataset.state),
    ).toEqual(["off", "on", "off"]);
  });

  it("makes every item a button that submits no form", () => {
    renderTravel();
    for (const item of screen.getAllByRole("radio")) {
      expect(item.tagName).toBe("BUTTON");
      expect(item.getAttribute("type")).toBe("button");
      expect(item.hasAttribute("aria-pressed")).toBe(false);
    }
  });

  it("is out of the tab order when disabled", () => {
    renderTravel({ disabled: true });

    expect(group().getAttribute("tabindex")).toBe("-1");
    for (const item of screen.getAllByRole("radio")) {
      expect(item).toBeDisabled();
      expect(item.hasAttribute("data-disabled")).toBe(true);
    }
  });

  it("keeps focus on an item while the choice changes around it", () => {
    const { rerender } = renderTravel();
    focus(radio("Drive"));

    rerender(
      <>
        <SegmentedControl
          label="Travel"
          options={options}
          value="drive"
          onValueChange={vi.fn()}
        />
        <button type="button">After</button>
      </>,
    );

    expect(document.activeElement).toBe(radio("Drive"));
    expect(radio("Drive").getAttribute("aria-checked")).toBe("true");
  });
});
