import { createFakeServices, type SearchResult } from "@karta/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusRegistryProvider, useFocusReturn } from "../../chrome";
import { ServicesProvider } from "../../services/ServicesProvider";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { SearchPill, type SearchPillProps } from "./SearchPill";
import { SEARCH_DEBOUNCE_MS } from "./useSearch";

const CAPE_TOWN: SearchResult = {
  id: "ct",
  label: "Cape Town",
  secondaryLabel: "Western Cape, South Africa",
  centre: { lat: -33.9249, lng: 18.4241 },
};
const CAPRICORN: SearchResult = {
  id: "cp",
  label: "Capricorn",
  centre: { lat: -23.9, lng: 29.4 },
};
const CAPE_AGULHAS: SearchResult = {
  id: "ca",
  label: "Cape Agulhas",
  secondaryLabel: "Western Cape",
  centre: { lat: -34.83, lng: 20.0 },
};

let restoreFocus: (name: "search") => void = () => undefined;

function RestoreProbe() {
  restoreFocus = useFocusReturn();
  return null;
}

function setup(props: Partial<SearchPillProps> = {}) {
  const services = createFakeServices();
  const onSelect = vi.fn();
  const focusMap = vi.fn();
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <FocusRegistryProvider focusMap={focusMap}>
          <RestoreProbe />
          <button type="button" data-testid="outside">
            Outside
          </button>
          <SearchPill onSelect={onSelect} {...props} />
        </FocusRegistryProvider>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, services, onSelect, focusMap };
}

const input = () => screen.getByTestId("location-search-input");
const listbox = () => screen.getByTestId("location-search-results");
const options = () => within(listbox()).queryAllByRole("option");

async function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  });
}

/** Returns false when the key's default action was prevented. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(input(), { key, ...init });
}

describe("SearchPill", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("structure", () => {
    it("is a named search landmark holding a named combobox", () => {
      setup();
      const landmark = screen.getByRole("search", { name: "Search" });
      const combobox = within(landmark).getByRole("combobox", {
        name: "Search places",
      });
      expect(combobox).toBe(input());
      expect(combobox.getAttribute("placeholder")).toBe("Search places");
      expect(combobox.getAttribute("aria-autocomplete")).toBe("list");
      expect(combobox.getAttribute("aria-expanded")).toBe("false");
      expect(combobox.getAttribute("aria-activedescendant")).toBeNull();
    });

    it("points aria-controls at the listbox even while it is empty", () => {
      setup();
      const id = input().getAttribute("aria-controls");
      expect(id).toBeTruthy();
      expect(listbox().id).toBe(id);
      expect(listbox().getAttribute("role")).toBe("listbox");
    });

    it("marks the chrome and the panel", () => {
      setup();
      expect(screen.getByTestId("search-pill").dataset.chrome).toBeTruthy();
      expect(
        screen.getByTestId("location-search-panel").dataset.chrome,
      ).toBeTruthy();
    });

    it("adds no live regions of its own", async () => {
      const { services } = setup();
      services.fakes.search.failWith("failed");
      await type("cape");
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });

    it("sets no inline styles", async () => {
      const { container, services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN]);
      await type("cape");
      expect(container.querySelectorAll("[style]")).toHaveLength(0);
    });

    it("registers the input as the search focus target", () => {
      const { focusMap } = setup();
      act(() => restoreFocus("search"));
      expect(document.activeElement).toBe(input());
      expect(focusMap).not.toHaveBeenCalled();
    });
  });

  describe("showing results", () => {
    it("lists labels and secondary labels as options and expands the combobox", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN, CAPRICORN]);
      await type("cap");
      expect(input().getAttribute("aria-expanded")).toBe("true");
      const found = options();
      expect(found).toHaveLength(2);
      expect(found[0]?.textContent).toContain("Cape Town");
      expect(found[0]?.textContent).toContain("Western Cape, South Africa");
      expect(found[1]?.textContent).toBe("Capricorn");
      expect(
        found.every((o) => o.getAttribute("aria-selected") === "false"),
      ).toBe(true);
      expect(screen.getByTestId("location-search-panel").hidden).toBe(false);
    });

    it("never takes focus from the input", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN, CAPRICORN]);
      input().focus();
      await type("cap");
      press("ArrowDown");
      press("ArrowDown");
      expect(document.activeElement).toBe(input());
      expect(listbox().contains(document.activeElement)).toBe(false);
    });

    it("hides the panel when there is nothing to show", () => {
      setup();
      expect(screen.getByTestId("location-search-panel").hidden).toBe(true);
    });

    it("renders only the latest results when typing continues", async () => {
      const { services } = setup();
      const first = services.fakes.search.holdNext();
      const second = services.fakes.search.holdNext();
      await type("ca");
      await type("cap");
      await act(async () => second.resolve([CAPRICORN]));
      await act(async () => first.resolve([CAPE_TOWN]));
      expect(options().map((o) => o.textContent)).toEqual(["Capricorn"]);
    });

    it("announces the number of results", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN, CAPRICORN]);
      await type("cap");
      expect(screen.getByTestId("live-region-polite").textContent).toBe(
        "2 results",
      );
    });

    it("passes the bias to the search", async () => {
      const bias = { south: -34, west: 18, north: -33, east: 19 };
      const { services } = setup({ bias });
      await type("cap");
      expect(services.fakes.search.searchCalls[0]?.options?.bias).toBe(bias);
    });
  });

  describe("text states", () => {
    it("says Searching... while waiting", async () => {
      const { services } = setup();
      services.fakes.search.holdNext();
      await type("cape");
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("Searching...")).toBeTruthy();
      expect(options()).toHaveLength(0);
    });

    it("says when nothing matched", async () => {
      setup();
      await type("zzzz");
      expect(screen.getByText("Nothing matched that search.")).toBeTruthy();
      expect(screen.queryByText("Searching...")).toBeNull();
    });

    it.each(["offline", "rate-limited", "failed"] as const)(
      "shows one friendly message with Retry for a %s failure",
      async (kind) => {
        const { services } = setup();
        services.fakes.search.failWith(kind);
        await type("cape");
        expect(
          screen.getByText(
            "Search is unavailable right now. Please try again.",
          ),
        ).toBeTruthy();
        expect(screen.getByTestId("location-search-retry").textContent).toBe(
          "Retry",
        );
      },
    );

    it("retries when Retry is pressed and keeps focus in the input", async () => {
      const { services } = setup();
      services.fakes.search.failWith("failed");
      input().focus();
      await type("cape");
      services.fakes.search.clearFailure();
      services.fakes.search.setDefaultResults([CAPE_TOWN]);
      const retry = screen.getByTestId("location-search-retry");
      expect(fireEvent.mouseDown(retry)).toBe(false);
      await act(async () => {
        fireEvent.click(retry);
      });
      expect(options().map((o) => o.textContent)).toEqual([
        "Cape TownWestern Cape, South Africa",
      ]);
      expect(document.activeElement).toBe(input());
    });

    it("lets a keyboard user Tab to Retry without closing the panel", async () => {
      const { services } = setup();
      services.fakes.search.failWith("failed");
      input().focus();
      await type("cape");
      const retry = screen.getByTestId("location-search-retry");
      act(() => retry.focus());
      expect(screen.getByTestId("location-search-retry")).toBe(retry);
      expect(input().getAttribute("aria-expanded")).toBe("true");
    });
  });

  describe("keyboard", () => {
    async function withResults() {
      const view = setup();
      view.services.fakes.search.setDefaultResults([
        CAPE_TOWN,
        CAPRICORN,
        CAPE_AGULHAS,
      ]);
      input().focus();
      await type("cap");
      return view;
    }

    const activeId = () => input().getAttribute("aria-activedescendant");

    it("ArrowDown moves the active option and wraps", async () => {
      await withResults();
      expect(press("ArrowDown")).toBe(false);
      expect(activeId()).toBe(options()[0]?.id);
      expect(options()[0]?.getAttribute("aria-selected")).toBe("true");
      press("ArrowDown");
      expect(activeId()).toBe(options()[1]?.id);
      expect(options()[0]?.getAttribute("aria-selected")).toBe("false");
      press("ArrowDown");
      press("ArrowDown");
      expect(activeId()).toBe(options()[0]?.id);
    });

    it("ArrowUp starts at the last option and wraps", async () => {
      await withResults();
      expect(press("ArrowUp")).toBe(false);
      expect(activeId()).toBe(options()[2]?.id);
      press("ArrowUp");
      expect(activeId()).toBe(options()[1]?.id);
      press("ArrowUp");
      press("ArrowUp");
      expect(activeId()).toBe(options()[2]?.id);
    });

    it("marks the active option with a chevron as well as selection", async () => {
      await withResults();
      expect(options()[0]?.querySelector("svg")).toBeNull();
      press("ArrowDown");
      expect(options()[0]?.querySelector("svg")).not.toBeNull();
      expect(options()[1]?.querySelector("svg")).toBeNull();
    });

    it("ArrowDown reopens a list closed with Escape and activates the first option", async () => {
      await withResults();
      press("Escape");
      expect(input().getAttribute("aria-expanded")).toBe("false");
      press("ArrowDown");
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(activeId()).toBe(options()[0]?.id);
    });

    it("ArrowUp reopens a closed list on the last option", async () => {
      await withResults();
      press("Escape");
      press("ArrowUp");
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(activeId()).toBe(options()[2]?.id);
    });

    it("ArrowDown opens the text panel when the search found nothing, without an active option", async () => {
      setup();
      await type("zzzz");
      press("Escape");
      expect(press("ArrowDown")).toBe(false);
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(activeId()).toBeNull();
    });

    it("leaves the arrow keys alone when there is no search", () => {
      setup();
      expect(press("ArrowDown")).toBe(true);
      expect(press("ArrowUp")).toBe(true);
    });

    it.each(["Home", "End"])(
      "%s is left to the browser to move the caret, and returns visual focus to the input",
      async (key) => {
        await withResults();
        press("ArrowDown");
        expect(activeId()).not.toBeNull();
        expect(press(key)).toBe(true);
        expect(activeId()).toBeNull();
        expect(input().getAttribute("aria-expanded")).toBe("true");
        expect(
          options().every((o) => o.getAttribute("aria-selected") === "false"),
        ).toBe(true);
      },
    );

    it("Enter selects the active option and fills the input with its label", async () => {
      const { onSelect } = await withResults();
      press("ArrowDown");
      press("ArrowDown");
      expect(press("Enter")).toBe(false);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(CAPRICORN);
      expect((input() as HTMLInputElement).value).toBe("Capricorn");
      expect(input().getAttribute("aria-expanded")).toBe("false");
      expect(input().getAttribute("aria-activedescendant")).toBeNull();
      expect(document.activeElement).toBe(input());
    });

    it("does not search again for the label that was just selected", async () => {
      const { services } = await withResults();
      const before = services.fakes.search.searchCalls.length;
      press("ArrowDown");
      press("Enter");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(services.fakes.search.searchCalls).toHaveLength(before);
      expect(input().getAttribute("aria-expanded")).toBe("false");
    });

    it("searches again when the user edits the text after selecting", async () => {
      const { services } = await withResults();
      press("ArrowDown");
      press("Enter");
      const before = services.fakes.search.searchCalls.length;
      await type("Cape Towns");
      expect(services.fakes.search.searchCalls).toHaveLength(before + 1);
    });

    it("Enter does nothing with no active option", async () => {
      const { onSelect } = await withResults();
      expect(press("Enter")).toBe(true);
      expect(onSelect).not.toHaveBeenCalled();
      expect(input().getAttribute("aria-expanded")).toBe("true");
    });

    it("Enter does nothing while the list is closed", async () => {
      const { onSelect } = await withResults();
      press("ArrowDown");
      press("Escape");
      press("Enter");
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("ignores keys pressed during IME composition", async () => {
      const { onSelect } = await withResults();
      press("ArrowDown");
      expect(press("Enter", { isComposing: true })).toBe(true);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("Escape closes the list, a second Escape clears the text, and a third reaches the page", async () => {
      await withResults();
      const reachedPage = vi.fn();
      document.addEventListener("keydown", reachedPage);
      try {
        press("ArrowDown");
        reachedPage.mockClear();
        expect(press("Escape")).toBe(false);
        expect(input().getAttribute("aria-expanded")).toBe("false");
        expect(input().getAttribute("aria-activedescendant")).toBeNull();
        expect((input() as HTMLInputElement).value).toBe("cap");

        expect(press("Escape")).toBe(false);
        expect((input() as HTMLInputElement).value).toBe("");
        expect(reachedPage).not.toHaveBeenCalled();

        expect(press("Escape")).toBe(true);
        expect(reachedPage).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener("keydown", reachedPage);
      }
    });

    it("typing resets the active option", async () => {
      await withResults();
      press("ArrowDown");
      fireEvent.change(input(), { target: { value: "capr" } });
      expect(input().getAttribute("aria-activedescendant")).toBeNull();
    });

    it("drops the active option when new results replace the list", async () => {
      const { services } = await withResults();
      press("ArrowDown");
      services.fakes.search.setDefaultResults([CAPRICORN]);
      await type("capr");
      expect(options()).toHaveLength(1);
      expect(input().getAttribute("aria-activedescendant")).toBeNull();
    });

    it("ignores other keys", async () => {
      await withResults();
      expect(press("a")).toBe(true);
      expect(press("Tab")).toBe(true);
    });
  });

  describe("pointer", () => {
    it("selects an option on click without moving focus", async () => {
      const { services, onSelect } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN, CAPRICORN]);
      input().focus();
      await type("cap");
      const option = options()[1] as HTMLElement;
      expect(fireEvent.mouseDown(option)).toBe(false);
      fireEvent.click(option);
      expect(onSelect).toHaveBeenCalledWith(CAPRICORN);
      expect((input() as HTMLInputElement).value).toBe("Capricorn");
      expect(document.activeElement).toBe(input());
    });
  });

  describe("clear button", () => {
    it("appears only when there is text", () => {
      setup();
      expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
      fireEvent.change(input(), { target: { value: "c" } });
      expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
    });

    it("empties the box, closes the list and returns focus to the input", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN]);
      await type("cape");
      const clear = screen.getByRole("button", { name: "Clear search" });
      expect(fireEvent.mouseDown(clear)).toBe(false);
      fireEvent.click(clear);
      expect((input() as HTMLInputElement).value).toBe("");
      expect(input().getAttribute("aria-expanded")).toBe("false");
      expect(options()).toHaveLength(0);
      expect(document.activeElement).toBe(input());
      expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    });
  });

  describe("focus", () => {
    it("passes focus and blur through", () => {
      const onFocus = vi.fn();
      const onBlur = vi.fn();
      setup({ onFocus, onBlur });
      act(() => input().focus());
      expect(onFocus).toHaveBeenCalledTimes(1);
      act(() => screen.getByTestId("outside").focus());
      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it("closes the list when focus leaves the search", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN]);
      input().focus();
      await type("cape");
      expect(input().getAttribute("aria-expanded")).toBe("true");
      act(() => screen.getByTestId("outside").focus());
      expect(input().getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps the list open when focus moves to the clear button", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN]);
      input().focus();
      await type("cape");
      act(() => screen.getByRole("button", { name: "Clear search" }).focus());
      expect(input().getAttribute("aria-expanded")).toBe("true");
    });

    it("shows the results again when the input regains focus", async () => {
      const { services } = setup();
      services.fakes.search.setDefaultResults([CAPE_TOWN]);
      input().focus();
      await type("cape");
      act(() => screen.getByTestId("outside").focus());
      act(() => input().focus());
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(options()).toHaveLength(1);
    });
  });
});
