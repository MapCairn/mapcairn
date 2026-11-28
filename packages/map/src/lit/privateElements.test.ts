// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountElement, unmountElements } from "../elementTestUtils";
import type { SegmentedControlElement } from "../ui/SegmentedControl/SegmentedControlElement";
import { definePrivateElements } from "./elements";

const options = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
] as const;

const tags = definePrivateElements();

async function mountUnits(): Promise<SegmentedControlElement> {
  const element = document.createElement(
    tags.segmented,
  ) as SegmentedControlElement;
  element.label = "Units";
  element.options = options;
  element.value = "metric";
  return mountElement(element);
}

const radio = (name: string) => screen.getByRole("radio", { name });

describe("the private segmented control element", () => {
  afterEach(unmountElements);

  it("is a radio group with its own name, drawn in the light DOM", async () => {
    const element = await mountUnits();

    const group = screen.getByRole("radiogroup", { name: "Units" });
    expect(group).toBe(element);
    expect(element.shadowRoot).toBeNull();
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(radio("Metric").getAttribute("aria-checked")).toBe("true");
    expect(radio("Metric").querySelector("svg path")).not.toBeNull();
  });

  it("moves focus on an arrow key and chooses on a click, which Space and Enter send", async () => {
    const element = await mountUnits();
    const choose = vi.fn();
    element.choose = choose;
    element.focus();
    expect(document.activeElement).toBe(radio("Metric"));

    radio("Metric").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement).toBe(radio("Imperial"));
    expect(choose).not.toHaveBeenCalled();

    radio("Imperial").click();
    expect(choose).toHaveBeenCalledExactlyOnceWith("imperial");
  });

  it("renders again when a property is set after construction", async () => {
    const element = await mountUnits();

    element.value = "imperial";
    element.label = "Eenhede";
    await element.updateComplete;

    expect(radio("Imperial").getAttribute("aria-checked")).toBe("true");
    expect(radio("Metric").querySelector("svg")).toBeNull();
    expect(element.getAttribute("aria-label")).toBe("Eenhede");
  });

  it("renders at once when flushed, so a parent's effect finds its buttons", async () => {
    const element = await mountUnits();

    element.options = [...options, { value: "nautical", label: "Nautical" }];
    element.flush();

    expect(element.querySelectorAll("button")).toHaveLength(3);
  });

  it("is defined once however often it is asked", () => {
    expect(definePrivateElements()).toEqual(tags);
  });
});

describe("the private announcement text element", () => {
  afterEach(unmountElements);

  it("writes its message as text, and nothing when it has none", async () => {
    const element = await mountElement(
      document.createElement(tags.announcement) as HTMLElement & {
        message: string;
        updateComplete: Promise<boolean>;
      } as never,
    );
    const text = element as unknown as HTMLElement & {
      message: string;
      flush: () => void;
    };
    expect(text.textContent).toBe("");

    text.message = "Saved <b>now</b>";
    text.flush();

    expect(text.textContent).toBe("Saved <b>now</b>");
    expect(text.querySelector("b")).toBeNull();
    expect(text.shadowRoot).toBeNull();
  });
});

describe("two copies of the package on one page", () => {
  afterEach(unmountElements);

  it("define their elements under different names, each with its own class", async () => {
    vi.resetModules();
    const second = (await import("./elements")).definePrivateElements();

    for (const kind of ["segmented", "announcement"] as const) {
      expect(second[kind]).not.toBe(tags[kind]);
      const first = customElements.get(tags[kind]);
      const other = customElements.get(second[kind]);
      expect(first).toBeDefined();
      expect(other).toBeDefined();
      expect(other).not.toBe(first);
      expect(document.createElement(tags[kind]).constructor).toBe(first);
      expect(document.createElement(second[kind]).constructor).toBe(other);
    }
  });
});
