import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { useSheetFocusTrap } from "./useSheetFocusTrap";

function TrapHarness() {
  const panelRef = createRef<HTMLElement>();
  useSheetFocusTrap(true, panelRef);

  return (
    <>
      <button type="button" data-testid="outside">
        Outside
      </button>
      <aside ref={panelRef} tabIndex={-1}>
        <details>
          <summary>More</summary>
          <button type="button" data-testid="hidden">
            Hidden
          </button>
        </details>
        <button type="button" data-testid="first">
          First
        </button>
        <button type="button" data-testid="last">
          Last
        </button>
      </aside>
    </>
  );
}

describe("useSheetFocusTrap", () => {
  it("skips hidden controls when wrapping Tab navigation", () => {
    render(<TrapHarness />);
    const hidden = screen.getByTestId("hidden");
    const first = screen.getByTestId("first");
    const last = screen.getByTestId("last");
    hidden.getClientRects = () => [];
    first.getClientRects = () => [new DOMRect()];
    last.getClientRects = () => [new DOMRect()];

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });

    expect(first).toHaveFocus();
  });

  it("returns focus to the panel when focus moves outside", () => {
    render(<TrapHarness />);
    const outside = screen.getByTestId("outside");
    const hidden = screen.getByTestId("hidden");
    const first = screen.getByTestId("first");
    hidden.getClientRects = () => [];
    first.getClientRects = () => [new DOMRect()];

    outside.focus();

    expect(first).toHaveFocus();
  });
});
