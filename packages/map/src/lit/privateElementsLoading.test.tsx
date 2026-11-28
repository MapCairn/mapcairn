// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { act, render, screen } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The page before Lit has loaded: what is drawn, where focus goes and what is
 * spoken. Each test imports the components afresh, with a definition that waits
 * until the test lets it load, or refuses to.
 */
async function coldPage() {
  vi.resetModules();
  let release: () => void = () => undefined;
  let refuse: (reason: Error) => void = () => undefined;
  const gate = new Promise<void>((resolve, reject) => {
    release = resolve;
    refuse = reject;
  });
  vi.doMock("./privateElements", async () => {
    const { createLazyDefinition } = await import("./lazyDefinition");
    return {
      privateElements: createLazyDefinition(async () => {
        await gate;
        return (await import("./elements")).definePrivateElements();
      }),
    };
  });
  const { createFakeServices } = await import("@mapcairn/core");
  const { ServicesProvider } = await import("../services");
  const live = await import("../ui/LiveRegion");
  const { SegmentedControl } = await import("../ui/SegmentedControl");
  const measure = await import("../tools/MeasureToolbar");
  const { privateElements } = await import("./privateElements");
  const settle = () => act(() => privateElements.define());
  return {
    ...live,
    ...measure,
    SegmentedControl,
    ServicesProvider,
    services: createFakeServices(),
    load: async () => {
      release();
      await settle();
    },
    fail: async () => {
      refuse(new Error("offline"));
      await settle();
    },
  };
}

type ColdPage = Awaited<ReturnType<typeof coldPage>>;

const polite = () => screen.getByTestId("live-region-polite");

/** Renders a provider and hands back the announcer a component below it gets. */
function renderAnnouncer(page: ColdPage, onMount?: string) {
  let announce: ReturnType<ColdPage["useAnnounce"]> = () => undefined;
  const { useAnnounce, LiveRegionProvider } = page;
  function Child() {
    const fromProvider = useAnnounce();
    announce = fromProvider;
    // An announcement from a child's own effect, in the first commit. The
    // announcer is the same function across renders, so this runs once.
    useEffect(() => {
      if (onMount !== undefined) {
        fromProvider(onMount, { keep: true });
      }
    }, [fromProvider]);
    return null;
  }
  const view = render(
    <LiveRegionProvider>
      <Child />
    </LiveRegionProvider>,
  );
  return { view, announce: () => announce };
}

describe("before the private elements have loaded", () => {
  afterEach(() => {
    vi.doUnmock("./privateElements");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("draws a segmented control once they have, with its props", async () => {
    const page = await coldPage();
    const { SegmentedControl } = page;
    render(
      <SegmentedControl
        label="Units"
        options={[{ value: "metric", label: "Metric" }]}
        value="metric"
        onValueChange={() => undefined}
        data-testid="units"
      />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();

    await page.load();

    expect(screen.getByRole("radiogroup", { name: "Units" })).toBe(
      screen.getByTestId("units"),
    );
    expect(screen.getByRole("radio", { name: "Metric" })).toBeChecked();
  });

  it("has both live regions in the page, empty, before anything is said", async () => {
    const page = await coldPage();
    renderAnnouncer(page);

    expect(polite().childNodes).toHaveLength(0);
    expect(screen.getByRole("alert").childNodes).toHaveLength(0);
  });

  it("keeps the first announcement and speaks it, in the same region, once they have", async () => {
    // Before the render: the announcer keeps the clock it is built with.
    vi.useFakeTimers();
    const page = await coldPage();
    const { announce } = renderAnnouncer(page, "Map ready.");
    const region = polite();
    act(() => announce()("Rain is on.", { keep: true }));
    expect(region.textContent).toBe("");

    await page.load();

    expect(polite()).toBe(region);
    expect(region.textContent).toBe("Map ready.");
    act(() => vi.advanceTimersByTime(600));
    expect(region.textContent).toBe("Rain is on.");
  });

  it("speaks anyway, as plain text, when they cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const page = await coldPage();
    renderAnnouncer(page, "Map ready.");

    await page.fail();

    expect(polite().textContent).toBe("Map ready.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("moves focus to the chosen mode of a measure toolbar opened before then", async () => {
    const page = await coldPage();
    const { MeasureToolbar, useMeasure, ServicesProvider } = page;
    function Toolbar() {
      return (
        <MeasureToolbar
          measure={useMeasure("metric")}
          onAddPointAtCentre={() => undefined}
          onDone={() => undefined}
        />
      );
    }
    render(
      <ServicesProvider services={page.services}>
        <Toolbar />
      </ServicesProvider>,
    );
    expect(document.activeElement).toBe(document.body);

    await page.load();

    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Distance" }),
    );
  });

  it("leaves focus where the person has moved it while they loaded", async () => {
    const page = await coldPage();
    const { MeasureToolbar, useMeasure, ServicesProvider } = page;
    function Toolbar() {
      return (
        <MeasureToolbar
          measure={useMeasure("metric")}
          onAddPointAtCentre={() => undefined}
          onDone={() => undefined}
        />
      );
    }
    render(
      <ServicesProvider services={page.services}>
        <input aria-label="Search" />
        <Toolbar />
      </ServicesProvider>,
    );
    act(() => screen.getByRole("textbox").focus());

    await page.load();

    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("hydrates a server's empty regions as they are and then writes into them", async () => {
    const page = await coldPage();
    const { LiveRegionProvider, useAnnounce } = page;
    let announce: ReturnType<ColdPage["useAnnounce"]> = () => undefined;
    function Child() {
      announce = useAnnounce();
      return null;
    }
    const tree = createElement(LiveRegionProvider, null, createElement(Child));
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = renderToString(tree);
    const served = polite();
    expect(served.childNodes).toHaveLength(0);
    // Loaded before hydration starts, the case where the two could differ.
    await page.load();
    const mismatch = vi.fn();

    const root = await act(async () =>
      hydrateRoot(container, tree, { onRecoverableError: mismatch }),
    );
    act(() => announce("Copied."));

    expect(mismatch).not.toHaveBeenCalled();
    expect(polite()).toBe(served);
    expect(served.textContent).toBe("Copied.");
    act(() => root.unmount());
    container.remove();
  });
});
