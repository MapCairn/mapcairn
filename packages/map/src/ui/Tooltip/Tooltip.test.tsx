// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createFakeServices } from "@mapcairn/core";
import { tokens } from "@mapcairn/theme";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { ServicesProvider } from "../../services";
import { Tooltip, TooltipProvider } from "./Tooltip";

beforeAll(() => {
  // Radix Tooltip positions its content with Floating UI, which observes sizes.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function setup(
  children: ReactNode,
  preferences: { finePointer?: boolean } = {},
) {
  const services = createFakeServices();
  services.fakes.preferences.set(preferences);
  const view = render(
    <ServicesProvider services={services}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </ServicesProvider>,
  );
  return { services, ...view };
}

const trigger = () => screen.getByRole("button", { name: "Zoom in" });

describe("Tooltip", () => {
  it("renders the trigger and no tooltip until it is asked for", () => {
    setup(
      <Tooltip content="Zoom in">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    expect(trigger()).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens when the trigger receives keyboard focus", () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    act(() => {
      trigger().focus();
    });
    expect(screen.getByRole("tooltip").textContent).toBe("Shortcut: plus");
  });

  it("opens when a mouse hovers the trigger", async () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    fireEvent.pointerMove(trigger(), { pointerType: "mouse" });
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Shortcut: plus",
    );
  });

  it("describes the trigger without taking over its accessible name", () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    act(() => {
      trigger().focus();
    });
    expect(trigger()).toHaveAccessibleName("Zoom in");
    expect(trigger()).toHaveAccessibleDescription("Shortcut: plus");
  });

  it("closes when Escape is pressed", () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    act(() => {
      trigger().focus();
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes when the trigger loses focus", () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    act(() => {
      trigger().focus();
    });
    act(() => {
      trigger().blur();
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open while the pointer moves from the trigger onto the tooltip", async () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    fireEvent.pointerMove(trigger(), { pointerType: "mouse" });
    await screen.findByRole("tooltip");
    fireEvent.pointerLeave(trigger(), { pointerType: "mouse" });
    // The grace area keeps the tooltip mounted until the pointer leaves it.
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("renders only the trigger when the primary input cannot hover", () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
      { finePointer: false },
    );
    act(() => {
      trigger().focus();
    });
    fireEvent.pointerMove(trigger(), { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(trigger().hasAttribute("data-state")).toBe(false);
    expect(trigger().hasAttribute("aria-describedby")).toBe(false);
  });

  it("switches live when the pointer preference changes", () => {
    const { services } = setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
      { finePointer: false },
    );
    act(() => {
      services.fakes.preferences.set({ finePointer: true });
    });
    act(() => {
      trigger().focus();
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});

/** The name of the custom property behind a colour token. */
function propertyOf(reference: string): string {
  return /^var\((--[\w-]+)\)$/.exec(reference)?.[1] ?? "";
}

describe("Tooltip inside a scoped host theme", () => {
  const surface = propertyOf(tokens.color.surface);
  const text = propertyOf(tokens.color.text);

  /** The visible bubble: Radix marks it with the side it sits on. */
  const bubble = () => {
    const element = document.body.querySelector<HTMLElement>("[data-side]");
    expect(element).not.toBeNull();
    return element as HTMLElement;
  };

  /*
   * jsdom does not inherit custom properties, so the host colours are set on
   * the trigger itself; a browser inherits them from the scope.
   */
  function scoped() {
    return setup(
      <div data-testid="scope">
        <Tooltip content="Shortcut: plus">
          <button
            type="button"
            ref={(node) => {
              node?.style.setProperty(surface, "#101820");
              node?.style.setProperty(text, "#f2f4f6");
            }}
          >
            Zoom in
          </button>
        </Tooltip>
      </div>,
    );
  }

  it("gives the portalled bubble the colours its trigger sees", () => {
    scoped();
    act(() => {
      trigger().focus();
    });
    expect(screen.getByTestId("scope").contains(bubble())).toBe(false);
    expect(bubble().style.getPropertyValue(surface)).toBe("#101820");
    expect(bubble().style.getPropertyValue(text)).toBe("#f2f4f6");
  });

  it("sets nothing when the trigger sees no host colours", () => {
    setup(
      <Tooltip content="Shortcut: plus">
        <button type="button">Zoom in</button>
      </Tooltip>,
    );
    act(() => {
      trigger().focus();
    });
    expect(bubble().style.getPropertyValue(surface)).toBe("");
  });
});

describe("TooltipProvider", () => {
  it("renders its children", () => {
    render(
      <TooltipProvider>
        <p>inside</p>
      </TooltipProvider>,
    );
    expect(screen.getByText("inside")).toBeTruthy();
  });
});
