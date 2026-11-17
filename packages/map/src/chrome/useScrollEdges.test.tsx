// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollMoreOf, useScrollEdges } from "./useScrollEdges";

/** Gives a jsdom element the geometry of a scroll container. */
function sizeOf(
  element: HTMLElement,
  sizes: { scrollTop: number; clientHeight: number; scrollHeight: number },
): void {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(element, key, { value, configurable: true });
  }
}

describe("scrollMoreOf", () => {
  const element = document.createElement("div");

  it("says none when everything fits", () => {
    sizeOf(element, { scrollTop: 0, clientHeight: 100, scrollHeight: 100 });
    expect(scrollMoreOf(element)).toBe("none");
  });

  it("says below at the start of a column that overflows", () => {
    sizeOf(element, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 });
    expect(scrollMoreOf(element)).toBe("below");
  });

  it("says both part of the way", () => {
    sizeOf(element, { scrollTop: 80, clientHeight: 100, scrollHeight: 300 });
    expect(scrollMoreOf(element)).toBe("both");
  });

  it("says above at the end", () => {
    sizeOf(element, { scrollTop: 200, clientHeight: 100, scrollHeight: 300 });
    expect(scrollMoreOf(element)).toBe("above");
  });

  it("ignores a fraction of a pixel at an edge", () => {
    sizeOf(element, { scrollTop: 0.4, clientHeight: 100, scrollHeight: 100.6 });
    expect(scrollMoreOf(element)).toBe("none");
  });
});

function Scroller({ label }: { readonly label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref);
  return (
    <div ref={ref} data-testid="scroller">
      {label}
    </div>
  );
}

describe("useScrollEdges", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets data-scroll-more on render, on scroll and when the box resizes", () => {
    let resize: () => void = () => undefined;
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { getByTestId, rerender, unmount } = render(<Scroller label="a" />);
    const scroller = getByTestId("scroller");
    expect(scroller).toHaveAttribute("data-scroll-more", "none");

    sizeOf(scroller, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 });
    rerender(<Scroller label="b" />);
    expect(scroller).toHaveAttribute("data-scroll-more", "below");

    sizeOf(scroller, { scrollTop: 200, clientHeight: 100, scrollHeight: 300 });
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(scroller).toHaveAttribute("data-scroll-more", "above");

    sizeOf(scroller, { scrollTop: 0, clientHeight: 300, scrollHeight: 300 });
    act(() => resize());
    expect(scroller).toHaveAttribute("data-scroll-more", "none");

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("still follows the scroll where there is no ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { getByTestId, unmount } = render(<Scroller label="a" />);
    const scroller = getByTestId("scroller");
    sizeOf(scroller, { scrollTop: 50, clientHeight: 100, scrollHeight: 300 });
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
    });
    expect(scroller).toHaveAttribute("data-scroll-more", "both");
    unmount();
  });
});
